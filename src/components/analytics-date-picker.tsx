import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AnalyticsDatePicker({ label, value, onChange }: { label: string; value?: Date; onChange: (value: Date | undefined) => void }) {
  return <Popover>
    <PopoverTrigger asChild><Button variant="outline" aria-label={label}><CalendarIcon className="size-4" />{value ? format(value, "d MMM yyyy") : label}</Button></PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={value} onSelect={onChange} className="pointer-events-auto" /></PopoverContent>
  </Popover>;
}