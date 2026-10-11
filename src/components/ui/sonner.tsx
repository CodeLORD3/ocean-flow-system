import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Appens enda toaster: överst i mitten, under rubriken och telefonens statusrad. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      closeButton
      offset="calc(env(safe-area-inset-top) + 4rem)"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:text-base",
          title: "text-base",
          description: "group-[.toast]:text-muted-foreground text-[15px]",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground tap-compact",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground tap-compact",
          closeButton: "tap-compact",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
