import { useParams } from 'react-router-dom';

export default function PoliticianDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <h1>Politician Detail</h1>
      <p>Details for politician <code>{id}</code>. (Coming soon)</p>
    </div>
  );
}
