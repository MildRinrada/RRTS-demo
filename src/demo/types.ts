export interface ExportRows {
  name: string;
  jobs: Record<string, string | number>[];
  payments: { at: string; jobNo: string; method: string; amount: number }[];
}
