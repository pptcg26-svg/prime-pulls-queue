import './styles.css';

export const metadata = {
  title: 'Prime Pulls Queue',
  description: 'Live Shopify queue overlay for Prime Pulls TCG'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
