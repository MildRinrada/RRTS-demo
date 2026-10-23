import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Button, QueryState } from '../../components/ui';
import type { PrintDoc } from '../../demo/server';

const PAPER = { a5: { label: 'กระดาษ A5', width: '148mm' }, '80mm': { label: 'เครื่องพิมพ์ใบเสร็จ 80 มม.', width: '80mm' }, sticker: { label: 'สติกเกอร์ 50 x 30 มม.', width: '50mm' } };

/**
 * The demo's stand-in for the server's PDF endpoints: the same document HTML, shown at paper size.
 * The print button prints just the document, and the browser's print window can save it as a PDF.
 */
export function PrintPage() {
  const { doc = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const size = params.get('size') === '80mm' ? '80mm' : 'a5';
  const path = doc === 'warranty' ? `/public/jobs/${id}/doc/warranty` : `/shop/jobs/${id}/doc/${doc}?size=${size}`;
  const q = useQuery({ queryKey: ['print', path], queryFn: () => api.get<PrintDoc>(path), retry: false });
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (q.data) document.title = q.data.title;
  }, [q.data]);

  if (q.error instanceof ApiError && q.error.status === 401) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  function fit() {
    const body = frame.current?.contentDocument?.documentElement;
    if (body) setHeight(body.scrollHeight);
  }

  /** Measured once the document and its fonts are in, so the sheet is never cut short. */
  function loaded() {
    fit();
    frame.current?.contentDocument?.fonts?.ready.then(fit);
  }

  const paper = q.data ? PAPER[q.data.paper] : null;
  return (
    <div className="print">
      <header className="print__bar">
        <div>
          <h1 className="print__title">{q.data?.title ?? 'เอกสาร'}</h1>
          {paper && <p className="t-small t-muted">{paper.label} ในหน้าต่างพิมพ์ เลือกเครื่องพิมพ์ หรือเลือกบันทึกเป็น PDF</p>}
        </div>
        <Button variant="primary" disabled={!q.data} onClick={() => frame.current?.contentWindow?.print()}>
          <Printer aria-hidden="true" />
          พิมพ์
        </Button>
      </header>
      <main className="print__desk" id="main">
        <QueryState loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {q.data && paper && (
            <div className={`print__sheet${q.data.paper === 'sticker' ? ' print__sheet--sticker' : ''}`}>
              <iframe
                ref={frame}
                title={q.data.title}
                srcDoc={q.data.html}
                onLoad={loaded}
                style={{ width: paper.width, height: height ? `${height}px` : q.data.paper === 'sticker' ? '30mm' : '210mm' }}
              />
            </div>
          )}
        </QueryState>
      </main>
    </div>
  );
}
