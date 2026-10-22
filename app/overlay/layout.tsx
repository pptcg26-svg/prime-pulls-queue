export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return <>
    {/* Apply before hydration, including in OBS browsers without CSS :has(). */}
    <style>{'html, body { background: transparent !important; }'}</style>
    {children}
  </>;
}
