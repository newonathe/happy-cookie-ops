// Only the sign-in form uses next/navigation; the Vite harness has no Next router to mount.
export function useRouter() {
  const go = (href) => window.location.assign(href);
  return { replace: go, push: go, refresh() {}, back: () => window.history.back() };
}
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const usePathname = () => window.location.pathname;
