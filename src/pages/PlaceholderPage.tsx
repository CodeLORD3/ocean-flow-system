import { motion } from "framer-motion";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-[60vh] text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Construction className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl font-heading font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground">Den här sektionen kommer snart.</p>
    </motion.div>
  );
}
