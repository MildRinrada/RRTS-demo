/** The reports' Excel export, built in the browser with the same columns as the server's. */
import type { ExportRows } from './types';

export async function buildWorkbook(data: ExportRows): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('งานซ่อม', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'เลขงาน', key: 'jobNo', width: 13 },
    { header: 'รับเครื่อง', key: 'received', width: 18 },
    { header: 'ลูกค้า', key: 'customer', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'เครื่อง', key: 'device', width: 26 },
    { header: 'IMEI/S/N', key: 'serial', width: 18 },
    { header: 'อาการ', key: 'issue', width: 34 },
    { header: 'สถานะ', key: 'status', width: 16 },
    { header: 'ช่าง', key: 'tech', width: 16 },
    { header: 'วันคาดว่าเสร็จ', key: 'eta', width: 14 },
    { header: 'เสร็จเมื่อ', key: 'completed', width: 18 },
    { header: 'ส่งมอบเมื่อ', key: 'delivered', width: 18 },
    { header: 'ค่าซ่อม (บาท)', key: 'charge', width: 13 },
    { header: 'รับแล้ว (บาท)', key: 'paid', width: 13 },
    { header: 'ค้าง (บาท)', key: 'due', width: 11 },
    { header: 'ประกันถึง', key: 'warranty', width: 13 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const row of data.jobs) ws.addRow(row);
  for (const k of ['charge', 'paid', 'due']) ws.getColumn(k).numFmt = '#,##0';

  const pay = wb.addWorksheet('รับเงิน', { views: [{ state: 'frozen', ySplit: 1 }] });
  pay.columns = [
    { header: 'วันที่', key: 'at', width: 18 },
    { header: 'เลขงาน', key: 'jobNo', width: 13 },
    { header: 'ช่องทาง', key: 'method', width: 12 },
    { header: 'จำนวน (บาท)', key: 'amount', width: 13 },
  ];
  pay.getRow(1).font = { bold: true };
  for (const row of data.payments) pay.addRow(row);
  pay.getColumn('amount').numFmt = '#,##0';

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
