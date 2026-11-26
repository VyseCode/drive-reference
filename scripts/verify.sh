#!/usr/bin/env bash
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3224}"
TMP=/tmp/opencode/drive-verify
mkdir -p "$TMP"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
    printf 'PASS  %-52s %s\n' "$label" "$actual"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL  %-52s expected %s got %s\n' "$label" "$expected" "$actual"
    printf 'body: '; head -c 400 "$TMP/body" 2>/dev/null; printf '\n'
  fi
}

request() {
  local method="$1" path="$2" jar="$3" data="${4:-}"
  local args=(-s -o "$TMP/body" -w "%{http_code}" -b "$jar" -c "$jar" -X "$method")
  if [[ -n "$data" ]]; then args+=(-H "Content-Type: application/json" --data "$data"); fi
  curl "${args[@]}" "$BASE$path"
}

get() {
  python3 - "$1" <<'PY'
import json, sys
data = json.load(open('/tmp/opencode/drive-verify/body'))
for key in sys.argv[1].split('.'):
    data = data[int(key)] if isinstance(data, list) else data[key]
print(str(data).lower() if isinstance(data, bool) else data)
PY
}

upload() {
  local jar="$1" file="$2" name="$3" parent="${4:-}"
  local args=(-s -o "$TMP/body" -w "%{http_code}" -b "$jar" -c "$jar" -X POST -F "file=@$file;filename=$name")
  if [[ -n "$parent" ]]; then args+=(-F "parent=$parent"); fi
  curl "${args[@]}" "$BASE/api/files/upload"
}

plain() { curl -s -o "$TMP/body" -w "%{http_code}" "$@"; }

: > "$TMP/alex.jar"; : > "$TMP/blair.jar"; : > "$TMP/casey.jar"; : > "$TMP/anon.jar"
printf 'hello vault\n' > "$TMP/notes.txt"
printf 'bad binary' > "$TMP/bad.exe"
dd if=/dev/zero of="$TMP/big.txt" bs=1024 count=3 status=none

echo '--- auth ---'
check 'me anonymous' 401 "$(request GET /api/auth/me "$TMP/anon.jar")"
check 'login wrong password' 401 "$(request POST /api/auth/login "$TMP/anon.jar" '{"email":"alex@example.com","password":"nope"}')"
check 'login alex' 200 "$(request POST /api/auth/login "$TMP/alex.jar" '{"email":"alex@example.com","password":"password123"}')"
check 'login blair' 200 "$(request POST /api/auth/login "$TMP/blair.jar" '{"email":"blair@example.com","password":"password123"}')"
check 'login casey' 200 "$(request POST /api/auth/login "$TMP/casey.jar" '{"email":"casey@example.com","password":"password123"}')"
check 'me authenticated' 200 "$(request GET /api/auth/me "$TMP/alex.jar")"
check 'register duplicate email' 409 "$(request POST /api/auth/register "$TMP/anon.jar" '{"name":"Dup","email":"alex@example.com","password":"password123"}')"
check 'register invalid payload' 400 "$(request POST /api/auth/register "$TMP/anon.jar" '{"name":"D","email":"bad","password":"x"}')"

echo '--- pages ---'
check 'login page' 200 "$(plain "$BASE/login")"
check 'register page' 200 "$(plain "$BASE/register")"
check 'drive anonymous redirects' 307 "$(plain "$BASE/drive")"
check 'drive authenticated' 200 "$(plain -b "$TMP/alex.jar" "$BASE/drive")"
check 'recent page' 200 "$(plain -b "$TMP/alex.jar" "$BASE/drive/recent")"
check 'starred page' 200 "$(plain -b "$TMP/alex.jar" "$BASE/drive/starred")"
check 'trash page' 200 "$(plain -b "$TMP/alex.jar" "$BASE/drive/trash")"
check 'search page' 200 "$(plain -b "$TMP/alex.jar" "$BASE/drive/search?q=roadmap")"
check 'invalid folder page' 404 "$(plain -b "$TMP/alex.jar" "$BASE/drive?folder=000000000000000000000000")"
check 'unknown page' 404 "$(plain "$BASE/no-such-page")"
check 'invalid share page' 200 "$(plain "$BASE/s/not-a-token")"
curl -s -b "$TMP/alex.jar" "$BASE/drive" | grep -q 'My files' && check 'drive HTML contains My files' yes yes || check 'drive HTML contains My files' yes no
curl -s -b "$TMP/alex.jar" "$BASE/drive/search?q=roadmap" | grep -q 'Roadmap 2026' && check 'search HTML contains result' yes yes || check 'search HTML contains result' yes no

echo '--- list endpoints ---'
check 'list root' 200 "$(request GET '/api/files?view=all&limit=100' "$TMP/alex.jar")"
check 'recent' 200 "$(request GET '/api/files?view=recent&limit=5' "$TMP/alex.jar")"
check 'starred' 200 "$(request GET '/api/files?view=starred' "$TMP/alex.jar")"
check 'trash' 200 "$(request GET '/api/files?view=trash' "$TMP/alex.jar")"
check 'search by name' 200 "$(request GET '/api/files?view=search&q=roadmap' "$TMP/alex.jar")"
check 'pagination page 2' 200 "$(request GET '/api/files?view=all&limit=1&page=2' "$TMP/alex.jar")"
check 'bounded limit' 60 "$(request GET '/api/files?view=all&limit=999' "$TMP/alex.jar" >/dev/null; python3 -c "import json;print(json.load(open('$TMP/body'))['limit'])")"
check 'empty search' 0 "$(request GET '/api/files?view=search&q=zzzznotfound' "$TMP/alex.jar" >/dev/null; get total)"
check 'list anonymous' 401 "$(request GET '/api/files' "$TMP/anon.jar")"

echo '--- CRUD and edge cases ---'
check 'create folder' 201 "$(request POST /api/files/folder "$TMP/alex.jar" '{"name":"Audit","parent":null}')"
AUDIT=$(get id)
check 'duplicate name in folder' 409 "$(request POST /api/files/folder "$TMP/alex.jar" '{"name":"audit","parent":null}')"
check 'create subfolder' 201 "$(request POST /api/files/folder "$TMP/alex.jar" "{\"name\":\"Sub\",\"parent\":\"$AUDIT\"}")"
SUB=$(get id)
check 'create sibling folder' 201 "$(request POST /api/files/folder "$TMP/alex.jar" "{\"name\":\"Draft\",\"parent\":\"$AUDIT\"}")"
check 'move folder into itself' 400 "$(request PATCH "/api/files/$AUDIT" "$TMP/alex.jar" "{\"action\":\"move\",\"parent\":\"$AUDIT\"}")"
check 'move folder into descendant' 400 "$(request PATCH "/api/files/$AUDIT" "$TMP/alex.jar" "{\"action\":\"move\",\"parent\":\"$SUB\"}")"
check 'rename folder' 200 "$(request PATCH "/api/files/$AUDIT" "$TMP/alex.jar" '{"action":"rename","name":"Audit 2026"}')"
check 'rename duplicate' 409 "$(request PATCH "/api/files/$SUB" "$TMP/alex.jar" '{"action":"rename","name":"Draft"}')"
check 'upload text file' 201 "$(upload "$TMP/alex.jar" "$TMP/notes.txt" 'notes.txt')"
NOTES=$(get id)
check 'upload duplicate name' 409 "$(upload "$TMP/alex.jar" "$TMP/notes.txt" 'notes.txt')"
check 'invalid file type' 415 "$(upload "$TMP/alex.jar" "$TMP/bad.exe" 'bad.exe')"
check 'quota exceeded' 413 "$(upload "$TMP/casey.jar" "$TMP/big.txt" 'big.txt')"
check 'star file' 200 "$(request PATCH "/api/files/$NOTES" "$TMP/alex.jar" '{"action":"star","starred":true}')"
check 'star appears in starred' true "$(request GET '/api/files?view=starred' "$TMP/alex.jar" >/dev/null; python3 -c "import json;print(any(i['id']=='$NOTES' for i in json.load(open('$TMP/body'))['items']))")"
check 'trash file' 200 "$(request PATCH "/api/files/$NOTES" "$TMP/alex.jar" '{"action":"trash"}')"
check 'file not in root after trash' true "$(request GET '/api/files?view=all&limit=100' "$TMP/alex.jar" >/dev/null; python3 -c "import json;print(not any(i['id']=='$NOTES' for i in json.load(open('$TMP/body'))['items']))")"
check 'file in trash' true "$(request GET '/api/files?view=trash' "$TMP/alex.jar" >/dev/null; python3 -c "import json;print(any(i['id']=='$NOTES' for i in json.load(open('$TMP/body'))['items']))")"
check 'restore file' 200 "$(request PATCH "/api/files/$NOTES" "$TMP/alex.jar" '{"action":"restore"}')"
check 'permanent delete' 200 "$(request DELETE "/api/files/$NOTES" "$TMP/alex.jar")"
check 'deleted file 404' 404 "$(request GET "/api/files/$NOTES" "$TMP/alex.jar")"
check 'mutation anonymous' 401 "$(request PATCH "/api/files/$AUDIT" "$TMP/anon.jar" '{"action":"star","starred":true}')"
check 'mutation invalid id' 404 "$(request PATCH /api/files/000000000000000000000000 "$TMP/alex.jar" '{"action":"star","starred":true}')"

echo '--- sharing ---'
request GET '/api/files?view=all&limit=100' "$TMP/alex.jar" >/dev/null
PALETTE=$(python3 -c "import json;print(next(i['id'] for i in json.load(open('$TMP/body'))['items'] if i['name']=='Design System'))")
check 'get folder children' 200 "$(request GET "/api/files?view=all&folder=$PALETTE" "$TMP/alex.jar")"
PALETTE=$(python3 -c "import json;print(next(i['id'] for i in json.load(open('$TMP/body'))['items'] if i['name']=='Brand palette.png'))")
check 'share info owner' 200 "$(request GET "/api/files/$PALETTE/share" "$TMP/alex.jar")"
TOKEN=$(get token)
check 'signed token issued' true "$(python3 -c "print(str(bool('$TOKEN' and '$TOKEN'.count('.')==2)).lower())")"
check 'resolve share link anonymously' 200 "$(request GET "/api/share/$TOKEN" "$TMP/anon.jar")"
check 'link content accessible' 200 "$(plain "$BASE/api/files/$PALETTE/content?token=$TOKEN")"
CTYPE=$(curl -s -o /dev/null -D - "$BASE/api/files/$PALETTE/content?token=$TOKEN" | tr -d '\r' | grep -i '^content-type:' | head -1)
check 'link content type image/png' yes "$( [[ "$CTYPE" == *'image/png'* ]] && echo yes || echo no )"
check 'tampered token rejected' 403 "$(request GET "/api/share/${TOKEN}x" "$TMP/anon.jar")"
check 'session without link is unauthorized' 403 "$(request GET "/api/files/$PALETTE" "$TMP/blair.jar")"
check 'revoke link' 200 "$(request POST "/api/files/$PALETTE/share" "$TMP/alex.jar" '{"visibility":"private"}')"
check 'revoked link rejected' 403 "$(request GET "/api/share/$TOKEN" "$TMP/anon.jar")"
check 'revoked content rejected' 403 "$(plain "$BASE/api/files/$PALETTE/content?token=$TOKEN")"

request GET '/api/files?view=all&limit=100&folder=' "$TMP/alex.jar" >/dev/null
request GET '/api/files?view=all&limit=100' "$TMP/alex.jar" >/dev/null
check 'upload editor file' 201 "$(upload "$TMP/alex.jar" "$TMP/notes.txt" 'editor.txt')"
EDITOR_FILE=$(get id)
check 'enable editor link' 200 "$(request POST "/api/files/$EDITOR_FILE/share" "$TMP/alex.jar" '{"visibility":"link","role":"editor"}')"
EDITOR_TOKEN=$(get token)
check 'editor link role' editor "$(request GET "/api/share/$EDITOR_TOKEN" "$TMP/anon.jar" >/dev/null; get role)"
check 'editor can rename via signed token' 200 "$(request PATCH "/api/files/$EDITOR_FILE?token=$EDITOR_TOKEN" "$TMP/anon.jar" '{"action":"rename","name":"editor-v2.txt"}')"
check 'editor cannot trash via signed token' 403 "$(request PATCH "/api/files/$EDITOR_FILE?token=$EDITOR_TOKEN" "$TMP/anon.jar" '{"action":"trash"}')"

check 'ACL editor finds shared file' 200 "$(request GET '/api/files?view=search&q=Roadmap' "$TMP/blair.jar")"
ROADMAP=$(python3 -c "import json;print(next(i['id'] for i in json.load(open('$TMP/body'))['items'] if i['name']=='Roadmap 2026.md'))")
check 'ACL editor access detail' 200 "$(request GET "/api/files/$ROADMAP" "$TMP/blair.jar")"
check 'ACL editor can rename' 200 "$(request PATCH "/api/files/$ROADMAP" "$TMP/blair.jar" '{"action":"rename","name":"Roadmap 2026 v2.md"}')"
check 'ACL editor cannot delete' 403 "$(request DELETE "/api/files/$ROADMAP" "$TMP/blair.jar")"
check 'ACL viewer access detail' 200 "$(request GET "/api/files/$ROADMAP" "$TMP/casey.jar")"
check 'ACL viewer cannot rename' 403 "$(request PATCH "/api/files/$ROADMAP" "$TMP/casey.jar" '{"action":"rename","name":"nope.md"}')"
request GET '/api/files?view=all&limit=100' "$TMP/alex.jar" >/dev/null
WELCOME=$(python3 -c "import json;print(next(i['id'] for i in json.load(open('$TMP/body'))['items'] if i['name']=='Welcome to Vault.txt'))")
check 'unauthorized user cannot open private file' 403 "$(request GET "/api/files/$WELCOME" "$TMP/casey.jar")"

echo '--- auth teardown ---'
check 'logout' 200 "$(request POST /api/auth/logout "$TMP/alex.jar")"
check 'me after logout' 401 "$(request GET /api/auth/me "$TMP/alex.jar")"

printf '\nRESULT: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
