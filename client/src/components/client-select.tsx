import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Client } from "@shared/schema";

interface ClientSelectProps {
  value: string;
  onValueChange: (value: string, clientName?: string) => void;
  companyId: string;
  placeholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

type ClientFormData = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  directorOfFacilities: string;
  notes: string;
};

const emptyFormData: ClientFormData = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  directorOfFacilities: "",
  notes: "",
};

export function ClientSelect({
  value,
  onValueChange,
  companyId,
  placeholder = "Select a client",
  disabled = false,
  "data-testid": testId,
}: ClientSelectProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(emptyFormData);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients", companyId],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const response = await apiRequest("POST", "/api/clients", {
        ...data,
        companyId,
      });
      return response.json();
    },
    onSuccess: (newClient: Client) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", companyId] });
      toast({ title: "Client created successfully" });
      onValueChange(newClient.id, newClient.name);
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create client",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setFormData(emptyFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Client name is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleSelectChange = (selectedValue: string) => {
    if (selectedValue === "__create_new__") {
      setIsCreateDialogOpen(true);
    } else if (selectedValue === "__clear__") {
      onValueChange("", "");
    } else {
      const client = clients.find((c) => c.id === selectedValue);
      onValueChange(selectedValue, client?.name);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {value && (
            <SelectItem value="__clear__" className="text-muted-foreground">
              Clear selection
            </SelectItem>
          )}
          <SelectItem value="__create_new__" className="text-primary font-medium">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create new client
            </div>
          </SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>
              Add a new client to your company. You can add more details later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">
                  Client Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter client name"
                  data-testid="input-new-client-name"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-contactName">Contact Name</Label>
                  <Input
                    id="create-contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="Primary contact"
                    data-testid="input-new-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-directorOfFacilities">Director of Facilities</Label>
                  <Input
                    id="create-directorOfFacilities"
                    value={formData.directorOfFacilities}
                    onChange={(e) => setFormData({ ...formData, directorOfFacilities: e.target.value })}
                    placeholder="Director name"
                    data-testid="input-new-director"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="client@example.com"
                    data-testid="input-new-client-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-phone">Phone</Label>
                  <Input
                    id="create-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    data-testid="input-new-client-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-address">Address</Label>
                <Input
                  id="create-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main St, City, State 12345"
                  data-testid="input-new-client-address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-notes">Notes</Label>
                <Textarea
                  id="create-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  data-testid="input-new-client-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                data-testid="button-cancel-new-client"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-save-new-client"
              >
                {createMutation.isPending ? "Creating..." : "Create Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
