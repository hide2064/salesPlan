import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  parseCsv,
  importSales,
  CSV_TEMPLATE_EXAMPLE,
  ImportRow,
  ImportResult,
} from '../api/importExport';
import { exportCsv } from '../utils/formatters';

export default function CsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  /** CSVファイル選択時にパースしてプレビュー表示 */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setRows(parsed);
      if (parsed.length === 0) toast.error('データ行が見つかりませんでした');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const mutation = useMutation({
    mutationFn: () => importSales(rows),
    onSuccess: (res) => {
      setResult(res);
      setRows([]);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['sales'] });
      if (res.inserted > 0) toast.success(`${res.inserted}件登録しました`);
      if (res.skipped > 0) toast.error(`${res.skipped}件スキップされました`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** テンプレートCSVをダウンロード */
  const downloadTemplate = () => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + CSV_TEMPLATE_EXAMPLE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">CSV取込</h1>

      {/* 手順説明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">取込手順</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
          <li>テンプレートをダウンロードして売上データを入力</li>
          <li>カテゴリ名・製品名はシステムに登録済みの名前と完全一致させる</li>
          <li>CSVファイルを選択してプレビューを確認</li>
          <li>「取込実行」ボタンで登録（エラー行はスキップ、正常行のみ登録）</li>
        </ol>
      </div>

      {/* テンプレートDL + ファイル選択 */}
      <div className="bg-white rounded-lg shadow-sm p-6 flex flex-wrap gap-4 items-center">
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
        >
          テンプレートをダウンロード
        </button>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="px-4 py-2 bg-gray-100 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-200">
            ファイルを選択
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />
          {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
        </label>
      </div>

      {/* プレビュー */}
      {rows.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b">
            <span className="text-sm font-medium text-gray-700">
              プレビュー（{rows.length}件）
              {rows.length > 10 && <span className="text-gray-400 ml-1">— 先頭10件表示</span>}
            </span>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? '取込中...' : '取込実行'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  {['行', '売上日', 'カテゴリ', '製品', '数量', '単価', '金額', '顧客名'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 text-gray-400">{i + 2}</td>
                    <td className="px-3 py-1.5">{r.sale_date}</td>
                    <td className="px-3 py-1.5">{r.category_name}</td>
                    <td className="px-3 py-1.5">{r.product_name || '-'}</td>
                    <td className="px-3 py-1.5 text-right">{r.quantity}</td>
                    <td className="px-3 py-1.5 text-right">{r.unit_price}</td>
                    <td className="px-3 py-1.5 text-right">{r.amount}</td>
                    <td className="px-3 py-1.5">{r.customer_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 取込結果 */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700">取込結果</p>
          <div className="flex gap-6 text-sm">
            <span className="text-green-600 font-medium">登録成功: {result.inserted}件</span>
            {result.skipped > 0 && (
              <span className="text-red-500 font-medium">スキップ: {result.skipped}件</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="border border-red-200 rounded bg-red-50 p-3 space-y-1 max-h-48 overflow-y-auto">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">
                  行 {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
