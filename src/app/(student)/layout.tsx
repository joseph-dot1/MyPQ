import { BottomNav } from "@/components/BottomNav";
import { AttemptSync } from "@/components/AttemptSync";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-16 min-h-screen">
      {children}
      <BottomNav />
      <AttemptSync />
    </div>
  );
}
