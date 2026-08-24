import './globals.css';

export const metadata = { title: 'German Viva Quiz', description: 'Random A1 German practice from Notion' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
