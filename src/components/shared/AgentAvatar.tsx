import { BrainCircuit, Code2, ShieldCheck, FlaskConical, Rocket, Bot, User } from 'lucide-react';
import { type AgentRole } from '@/core/types';
import './AgentAvatar.css';

type ResolvedRole = AgentRole | 'custom' | 'user';

interface AgentAvatarProps {
  role?: AgentRole | 'user';
  /** Kept for backwards-compatibility; role drives the icon now. */
  avatar?: string;
  size?: number;
  glow?: boolean;
}

export function AgentAvatar({ role, size = 16, glow = true }: AgentAvatarProps) {
  const activeRole: ResolvedRole = role || 'custom';
  const iconSize = Math.round(size * 0.62);

  const renderIcon = () => {
    switch (activeRole) {
      case 'user':
        return <User size={iconSize} strokeWidth={2.2} />;
      case 'planner':
        return <BrainCircuit size={iconSize} strokeWidth={2.2} />;
      case 'builder':
        return <Code2 size={iconSize} strokeWidth={2.2} />;
      case 'reviewer':
        return <ShieldCheck size={iconSize} strokeWidth={2.2} />;
      case 'tester':
        return <FlaskConical size={iconSize} strokeWidth={2.2} />;
      case 'deployer':
        return <Rocket size={iconSize} strokeWidth={2.2} />;
      case 'custom':
      default:
        return <Bot size={iconSize} strokeWidth={2.2} />;
    }
  };

  return (
    <span
      className={`agent-avatar agent-avatar--${activeRole} ${glow ? 'agent-avatar--glow' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {renderIcon()}
    </span>
  );
}
