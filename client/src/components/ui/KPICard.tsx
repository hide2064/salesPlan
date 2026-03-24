interface Props {
  title: string;
  value: string;
  sub?: string;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
}

const colors = {
  blue:   'border-blue-500 bg-blue-50',
  green:  'border-green-500 bg-green-50',
  red:    'border-red-500 bg-red-50',
  yellow: 'border-yellow-500 bg-yellow-50',
  gray:   'border-gray-300 bg-white',
};

export default function KPICard({ title, value, sub, color = 'gray' }: Props) {
  return (
    <div className={`rounded-lg border-l-4 p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
