// Who may see each page is checked by the page itself (a layout isn't re-run on every visit).
export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
