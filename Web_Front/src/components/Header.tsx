interface HeaderProps {
  isAnalyzing?: boolean;
  progress?: number;
  audioRoot?: string;
  onUnloadSounds?: () => void;
  audioCount?: number;
  currentSound?: string;
  sample?: any;
  hasData?: boolean;
  activeTab?: string;
}

export default function Header(_props: HeaderProps) {
  return null;
}
