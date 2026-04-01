import { useParams } from 'react-router-dom';

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <h1>Bill Detail</h1>
      <p>Details for bill <code>{id}</code>. (Coming soon)</p>
    </div>
  );
}
