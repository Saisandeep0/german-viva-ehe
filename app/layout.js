import './globals.css';

export const metadata = {
  title: 'German Practice',
  description:
    'German practice with my cutie bangaram :)',
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
