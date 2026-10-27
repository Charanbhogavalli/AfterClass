import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-6 px-5 py-24 sm:px-8">
      <p className="font-display text-7xl font-bold text-violet">404</p>
      <h1 className="font-display text-3xl">This page wandered off campus.</h1>
      <Link to="/">
        <Button>Back to the front page</Button>
      </Link>
    </div>
  );
}
