import './globals.css';

export const metadata = {
  title: 'HighlightGuard AI',
  description: 'Sports media protection and intelligence dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
