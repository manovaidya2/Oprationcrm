import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="text-6xl font-bold text-muted-foreground">404</div>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2"/>Go Back</Button>
    </div>
  );
}
