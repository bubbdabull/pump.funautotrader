import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
        success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        danger: 'border-red-500/30 bg-red-500/10 text-red-300',
        warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
        teal: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
