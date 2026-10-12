import { Card } from '@/components/ui/card'

/** Where a Field user lands when none of the Field pages is available to them right now. */
export function FieldHome() {
  return (
    <Card className="mx-auto max-w-sm gap-2 p-6 text-center">
      <p className="text-base font-medium">You're all set up</p>
      <p className="text-sm text-muted-foreground">There's nothing for you to do in QPaint OS just yet. We'll let you know when there is.</p>
    </Card>
  )
}
