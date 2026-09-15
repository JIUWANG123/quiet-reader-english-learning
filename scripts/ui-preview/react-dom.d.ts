// The isolated preview only uses this React DOM API; the mobile app has no DOM root.
declare module 'react-dom/client' {
  export function createRoot(container: Element): {
    render(children: import('react').ReactNode): void;
    unmount(): void;
  };
}
