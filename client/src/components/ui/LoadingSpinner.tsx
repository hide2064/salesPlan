export default function LoadingSpinner({ text = '読み込み中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      {text}
    </div>
  );
}
