import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SupportTutorial } from "@/lib/support.content";

export function VideoTutorialModal({
  tutorial,
  open,
  onOpenChange,
}: {
  tutorial: SupportTutorial | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!tutorial) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display text-lg pr-8">{tutorial.title}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full bg-black">
          <iframe
            title={tutorial.title}
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${tutorial.youtubeId}?rel=0`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
