import { Types } from "mongoose";
import type { ListOptions } from "@/lib/queries";

const VIEWS = new Set(["all", "recent", "starred", "trash", "search"]);

export function validId(value: string | null): Types.ObjectId | null {
  if (!value || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

export function parseListParams(
  params: URLSearchParams,
  viewerId: string,
): ListOptions {
  const viewParam = params.get("view") ?? "all";
  const view = (VIEWS.has(viewParam) ? viewParam : "all") as ListOptions["view"];
  const sortParam = params.get("sort") ?? "updatedAt";
  const sort = (["name", "updatedAt", "size"].includes(sortParam)
    ? sortParam
    : "updatedAt") as ListOptions["sort"];
  const pageRaw = Number(params.get("page") ?? "1");
  const limitRaw = Number(params.get("limit") ?? "24");
  const page = Number.isFinite(pageRaw) ? Math.min(10000, Math.max(1, Math.floor(pageRaw))) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.min(60, Math.max(1, Math.floor(limitRaw))) : 24;

  return {
    viewerId,
    view,
    folderId: validId(params.get("folder")),
    query: (params.get("q") ?? "").slice(0, 120),
    page,
    limit,
    sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
  };
}

export function cleanName(value: string): string {
  return value.replace(/[/\\\u0000-\u001f]/g, "_").trim().slice(0, 200);
}
