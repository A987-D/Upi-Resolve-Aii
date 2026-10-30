import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'UPI Resolve AI', description: 'Prototype on synthetic data. Mock connectors. No live Paytm or bank integration.' };
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>
    <header className="top"><b>UPI Resolve AI</b><nav><a href="/">Customer help</a><a href="/agent">Agent console</a></nav><span className="mock">MOCK · synthetic data</span></header>
    <main>{children}</main>
  </body></html>);
}
