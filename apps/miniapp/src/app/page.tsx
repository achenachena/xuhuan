import LanguageToggle from "@/components/language-toggle";
import { HostExperience } from "@/features/portfolio/host-experience";

const HomePage = () => (
  <div data-testid="game-entry">
    <HostExperience />
    <LanguageToggle />
  </div>
);

export default HomePage;
