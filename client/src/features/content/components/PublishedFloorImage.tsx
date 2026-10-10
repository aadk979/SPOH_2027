import { useEffect, useState, type ReactNode } from 'react';
import { useContentImage } from '../queries';
export function PublishedFloorImage({ path, alt }: { path?: string; alt: string }): ReactNode {
  const image = useContentImage(path);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(image.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image.data]);
  if (!url)
    return (
      <p className="text-caption text-text-muted">
        Floor plan unavailable. Use the location list below.
      </p>
    );
  // Authenticated bytes are represented by a local blob, with no credential in the URL.
  return <img src={url} alt={alt} className="w-full rounded-md" />;
}
