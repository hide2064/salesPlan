/**
 * @file LoadingSpinner.tsx
 * @description ローディングスピナーコンポーネント
 *
 * データフェッチ中・認証確認中などの待機状態に表示する。
 * SVG の animate-spin（Tailwind）でアニメーションを実現する。
 */

/**
 * ローディング状態を示すスピナーと任意のテキストを表示するコンポーネント。
 *
 * @param text - スピナーの横に表示するテキスト（デフォルト: '読み込み中...'）
 *
 * @example
 * // ページロード中
 * if (isLoading) return <LoadingSpinner />;
 *
 * // 認証確認中（カスタムテキスト）
 * if (isLoading) return <LoadingSpinner text="認証確認中..." />;
 */
export default function LoadingSpinner({ text = '読み込み中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      {/* SVGアイコン: animate-spin で回転アニメーション */}
      <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
        {/* 円のトラック（薄い部分） */}
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        {/* 円の弧（濃い部分、回転して見える） */}
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      {text}
    </div>
  );
}
