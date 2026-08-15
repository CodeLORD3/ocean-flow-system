import { useSignedUrl } from "@/hooks/useSignedUrl";

type StorageImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  url: string | null | undefined;
};

/** <img loading="lazy" decoding="async"> that transparently signs URLs pointing at private storage buckets. */
export function StorageImage({ url, alt = "", ...rest }: StorageImageProps) {
  const src = useSignedUrl(url);
  if (!src) return null;
  return <img src={src} alt={alt} {...rest}  loading="lazy" decoding="async" />;
}

type StorageLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  url: string | null | undefined;
};

/** <a> that transparently signs URLs pointing at private storage buckets. */
export function StorageLink({ url, children, ...rest }: StorageLinkProps) {
  const href = useSignedUrl(url);
  return (
    <a
      href={href ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={!href}
      {...rest}
    >
      {children}
    </a>
  );
}
