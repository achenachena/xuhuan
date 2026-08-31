import LanguageToggle from "@/components/language-toggle";
import GameShell from "@/features/game/game-shell";

const HomePage = () => (
  <>
    <span
      data-release-marker="CONTENT-V4 / SHOOTER-V1"
      className="sr-only"
    >
      CONTENT-V4 / SHOOTER-V1
    </span>
    <GameShell />
    <LanguageToggle />
  </>
);

export default HomePage;
