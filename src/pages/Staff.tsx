import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Filter, UserCheck, Clock, Calendar, ExternalLink, Phone, Mail, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const staffData = [
  { id: 1, name: "Johan Eriksson", role: "Butikschef", store: "Stockholm Östermalm", phone: "070-123 45 67", email: "johan@fiskhandel.se", status: "Aktiv", hoursWeek: 40, salary: 38500, startDate: "2019-03-15", pkId: "PK-1001" },
  { id: 2, name: "Anna Lindberg", role: "Fiskexpert", store: "Göteborg Haga", phone: "073-234 56 78", email: "anna@fiskhandel.se", status: "Aktiv", hoursWeek: 38, salary: 32000, startDate: "2020-06-01", pkId: "PK-1002" },
  { id: 3, name: "Erik Johansson", role: "Butikschef", store: "Göteborg Haga", phone: "070-345 67 89", email: "erik@fiskhandel.se", status: "Aktiv", hoursWeek: 40, salary: 38500, startDate: "2018-09-20", pkId: "PK-1003" },
  { id: 4, name: "Maria Svensson", role: "Kassapersonal", store: "Stockholm Södermalm", phone: "076-456 78 90", email: "maria@fiskhandel.se", status: "Aktiv", hoursWeek: 32, salary: 26500, startDate: "2021-01-10", pkId: "PK-1004" },
  { id: 5, name: "Lars Pettersson", role: "Fiskexpert", store: "Göteborg Linné", phone: "072-567 89 01", email: "lars@fiskhandel.se", status: "Semester", hoursWeek: 0, salary: 33000, startDate: "2020-03-01", pkId: "PK-1005" },
  { id: 6, name: "Sofia Nilsson", role: "Kassapersonal", store: "Stockholm Östermalm", phone: "070-678 90 12", email: "sofia@fiskhandel.se", status: "Aktiv", hoursWeek: 36, salary: 27000, startDate: "2022-08-15", pkId: "PK-1006" },
  { id: 7, name: "Karl Andersson", role: "Logistik", store: "Göteborg Majorna", phone: "073-789 01 23", email: "karl@fiskhandel.se", status: "Aktiv", hoursWeek: 40, salary: 30000, startDate: "2021-05-20", pkId: "PK-1007" },
  { id: 8, name: "Eva Bergström", role: "Butikschef", store: "Zürich", phone: "+41 79 890 12 34", email: "eva@fiskhandel.se", status: "Aktiv", hoursWeek: 42, salary: 52000, startDate: "2023-01-08", pkId: "PK-1008" },
  { id: 9, name: "Oskar Lundgren", role: "Fiskexpert", store: "Stockholm Södermalm", phone: "076-901 23 45", email: "oskar@fiskhandel.se", status: "Sjukskriven", hoursWeek: 0, salary: 31500, startDate: "2022-02-14", pkId: "PK-1009" },
  { id: 10, name: "Ida Holm", role: "Deltid", store: "Göteborg Majorna", phone: "070-012 34 56", email: "ida@fiskhandel.se", status: "Aktiv", hoursWeek: 20, salary: 14500, startDate: "2024-06-01", pkId: "PK-1010" },
];

const scheduleData = [
  { day: "Måndag", shifts: [
    { name: "Johan E.", store: "Sthlm Östermalm", time: "07:00–16:00" },
    { name: "Anna L.", store: "Gbg Haga", time: "08:00–17:00" },
    { name: "Maria S.", store: "Sthlm Södermalm", time: "09:00–17:00" },
    { name: "Eva B.", store: "Zürich", time: "07:00–16:00" },
  ]},
  { day: "Tisdag", shifts: [
    { name: "Johan E.", store: "Sthlm Östermalm", time: "07:00–16:00" },
    { name: "Erik J.", store: "Gbg Haga", time: "08:00–17:00" },
    { name: "Sofia N.", store: "Sthlm Östermalm", time: "10:00–18:00" },
    { name: "Karl A.", store: "Gbg Majorna", time: "08:00–16:00" },
  ]},
  { day: "Onsdag", shifts: [
    { name: "Anna L.", store: "Gbg Haga", time: "07:00–15:00" },
    { name: "Maria S.", store: "Sthlm Södermalm", time: "09:00–17:00" },
    { name: "Eva B.", store: "Zürich", time: "07:00–16:00" },
    { name: "Ida H.", store: "Gbg Majorna", time: "10:00–14:00" },
  ]},
];

const statusColor: Record<string, string> = {
  Aktiv: "bg-success/15 text-success border-success/20",
  Semester: "bg-primary/10 text-primary border-primary/20",
  Sjukskriven: "bg-warning/15 text-warning border-warning/20",
  Inaktiv: "bg-muted text-muted-foreground border-muted",
};

const storeFilter = ["Alla butiker", "Stockholm Östermalm", "Stockholm Södermalm", "Göteborg Haga", "Göteborg Linné", "Göteborg Majorna", "Zürich"];

export default function Staff() {
  const [search, setSearch] = useState("");
  const [store, setStore] = useState("Alla butiker");
  const filtered = staffData.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase());
    const matchStore = store === "Alla butiker" || s.store === store;
    return matchSearch && matchStore;
  });

  const totalStaff = staffData.length;
  const activeStaff = staffData.filter(s => s.status === "Aktiv").length;
  const totalHours = staffData.reduce((sum, s) => sum + s.hoursWeek, 0);
  const totalSalary = staffData.reduce((sum, s) => sum + s.salary, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Personalhantering</h2>
          <p className="text-xs text-muted-foreground">Hantera personal, scheman och löner — kopplat till Personalkollen</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <ExternalLink className="h-3 w-3" /> Öppna Personalkollen
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8">
            <Plus className="h-3 w-3" /> Lägg till personal
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Totalt anställda</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalStaff}</p>
            <p className="text-[10px] text-muted-foreground">{activeStaff} aktiva</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Timmar/vecka</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalHours}</p>
            <p className="text-[10px] text-muted-foreground">Snitt {Math.round(totalHours / activeStaff)}h/pers</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Lönekostnad/mån</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalSalary.toLocaleString("sv-SE")} kr</p>
            <p className="text-[10px] text-muted-foreground">Inkl. sociala avgifter: ~{Math.round(totalSalary * 1.3142).toLocaleString("sv-SE")} kr</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="h-5 w-5 rounded bg-accent/20 flex items-center justify-center">
                <UserCheck className="h-3 w-3 text-accent" />
              </div>
              <p className="text-[10px] text-muted-foreground">Personalkollen</p>
            </div>
            <p className="text-sm font-heading font-bold text-success">Ansluten</p>
            <p className="text-[10px] text-muted-foreground">Senaste synk: idag 08:00</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="roster" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="roster" className="text-xs h-7">Personalregister</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs h-7">Arbetsschema</TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs h-7">Löneöversikt</TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Sök personal..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
                <Select value={store} onValueChange={setStore}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeFilter.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">PK-ID</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Namn</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Roll</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Kontakt</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Timmar/v</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Anställd sedan</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((person) => (
                      <tr key={person.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-mono text-muted-foreground">{person.pkId}</td>
                        <td className="py-2 font-medium text-foreground">{person.name}</td>
                        <td className="py-2 text-muted-foreground">{person.role}</td>
                        <td className="py-2 text-muted-foreground">{person.store}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{person.phone}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right text-foreground">{person.hoursWeek}h</td>
                        <td className="py-2 text-muted-foreground">{person.startDate}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`${statusColor[person.status]} text-[10px]`}>{person.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
                <span>Visar {filtered.length} av {staffData.length} anställda</span>
                <span>Data synkad från Personalkollen</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Veckoschema — Vecka 10</CardTitle>
                  <CardDescription className="text-xs">Scheman hämtas från Personalkollen</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs h-7">← Föregående</Button>
                  <Button variant="outline" size="sm" className="text-xs h-7">Nästa →</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {scheduleData.map((day) => (
                  <div key={day.day}>
                    <h4 className="text-xs font-semibold text-foreground mb-1.5">{day.day}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {day.shifts.map((shift, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-foreground">{shift.name}</p>
                            <p className="text-[10px] text-muted-foreground">{shift.store} · {shift.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Löneöversikt — Mars 2026</CardTitle>
                  <CardDescription className="text-xs">Lönedata synkas via Personalkollen API</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                  <ExternalLink className="h-3 w-3" /> Exportera till Personalkollen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">PK-ID</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Namn</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Grundlön</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">OB-tillägg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Bruttolön</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Arb.avg 31,42%</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Total kostnad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffData.filter(s => s.status === "Aktiv").map((person) => {
                      const ob = Math.round(person.salary * 0.05);
                      const brutto = person.salary + ob;
                      const avgift = Math.round(brutto * 0.3142);
                      const total = brutto + avgift;
                      return (
                        <tr key={person.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-mono text-muted-foreground">{person.pkId}</td>
                          <td className="py-2 font-medium text-foreground">{person.name}</td>
                          <td className="py-2 text-muted-foreground">{person.store}</td>
                          <td className="py-2 text-right text-foreground">{person.salary.toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-right text-muted-foreground">{ob.toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-right font-medium text-foreground">{brutto.toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-right text-muted-foreground">{avgift.toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-right font-bold text-foreground">{total.toLocaleString("sv-SE")} kr</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td colSpan={5} className="py-2 font-semibold text-foreground">Totalt</td>
                      <td className="py-2 text-right font-bold text-foreground">
                        {staffData.filter(s => s.status === "Aktiv").reduce((sum, s) => sum + s.salary + Math.round(s.salary * 0.05), 0).toLocaleString("sv-SE")} kr
                      </td>
                      <td className="py-2 text-right font-medium text-muted-foreground">
                        {Math.round(staffData.filter(s => s.status === "Aktiv").reduce((sum, s) => sum + (s.salary + Math.round(s.salary * 0.05)) * 0.3142, 0)).toLocaleString("sv-SE")} kr
                      </td>
                      <td className="py-2 text-right font-bold text-foreground">
                        {Math.round(staffData.filter(s => s.status === "Aktiv").reduce((sum, s) => { const brutto = s.salary + Math.round(s.salary * 0.05); return sum + brutto + Math.round(brutto * 0.3142); }, 0)).toLocaleString("sv-SE")} kr
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
