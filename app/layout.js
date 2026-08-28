import './globals.css';

export const metadata = {
  title: 'German Practice',
  description:
    'German practice :(',
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
