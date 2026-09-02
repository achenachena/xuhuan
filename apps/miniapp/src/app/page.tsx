import LanguageToggle from "@/components/language-toggle";
import { HostExperience } from "@/features/portfolio/host-experience";

const HomePage = () => (
  <>
    <span
      data-release-marker="CONTENT-V4 / SHOOTER-V1"
      className="sr-only"
    >
      CONTENT-V4 / SHOOTER-V1
    </span>
    <HostExperience />
    <LanguageToggle />
  </>
);

export default HomePage;
