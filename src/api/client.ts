/**
 * The web app's API client. In the real system it calls the NestJS server over fetch; in this demo
 * every call is answered by the in-browser backend (src/demo/server.ts) with the same responses.
 */
import { handle } from '../demo/server';
import type { ExportRows } from '../demo/types';
import { ApiError } from './errors';

export { ApiError };

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

/** A short pause, so loading states show the way they do over a network. */
const LATENCY = 90;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  await new Promise((r) => setTimeout(r, LATENCY));
  try {
    return await handle<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error(e);
    throw new ApiError(500, 'error', 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: Body) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Downloads the Excel export: the rows come from the demo backend and the workbook is built here. */
export async function download(path: string, fallbackName: string) {
  const data = await request<ExportRows>('GET', path.replace('/export.xlsx', '/export'));
  const { buildWorkbook } = await import('../demo/xlsx');
  const url = URL.createObjectURL(await buildWorkbook(data));
  const a = document.createElement('a');
  a.href = url;
  a.download = data.name || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fields : {};
}
