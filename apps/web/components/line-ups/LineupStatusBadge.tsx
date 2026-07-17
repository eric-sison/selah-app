import { Badge } from "@workspace/ui/components/Badge"
import { Check, CircleDotDashed, Clock } from "lucide-react"
import { FunctionComponent, type ReactNode } from "react"
import { LINEUP_STATUS_LABELS, type LineupStatus } from "@/utils/lineup-status"

const STATUS_BADGE_CLASSES: Record<LineupStatus, string> = {
  draft: "",
  pending: "border-transparent bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  approved:
    "border-transparent bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
}

const STATUS_ICONS: Record<LineupStatus, ReactNode> = {
  draft: <CircleDotDashed />,
  pending: <Clock />,
  approved: <Check />,
}

interface LineupStatusBadgeProps {
  status: LineupStatus
}

export const LineupStatusBadge: FunctionComponent<LineupStatusBadgeProps> = ({ status }) => (
  <Badge variant="secondary" className={STATUS_BADGE_CLASSES[status]}>
    {STATUS_ICONS[status]}
    {LINEUP_STATUS_LABELS[status]}
  </Badge>
)
