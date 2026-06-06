import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("shared ui primitives", () => {
  it("renders the command palette wrappers", () => {
    render(
      <CommandDialog open onOpenChange={vi.fn()}>
        <Command>
          <CommandInput placeholder="Search commands" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem value="publish">
                Publish
                <CommandShortcut>CMD+P</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </CommandList>
        </Command>
      </CommandDialog>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search commands")).toHaveAttribute(
      "data-slot",
      "command-input"
    );
    expect(screen.getByText("Publish")).toHaveAttribute("data-slot", "command-item");
    expect(screen.getByText("CMD+P")).toHaveAttribute("data-slot", "command-shortcut");
  });

  it("renders select wrappers and menu content", () => {
    render(
      <Select defaultOpen value="alpha" onValueChange={vi.fn()}>
        <SelectTrigger aria-label="Topic">
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Topics</SelectLabel>
            <SelectItem value="alpha">Alpha</SelectItem>
            <SelectSeparator />
            <SelectItem value="beta">Beta</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    expect(screen.getByLabelText("Topic")).toHaveAttribute("data-slot", "select-trigger");
    expect(screen.getByText("Topics")).toHaveAttribute("data-slot", "select-label");
    expect(screen.getAllByText("Alpha")).toHaveLength(2);
    expect(document.querySelector("[data-slot='select-content']")).not.toBeNull();
    expect(document.querySelector("[data-slot='select-separator']")).not.toBeNull();
  });

  it("renders line-variant tabs and switches content", () => {
    render(
      <Tabs defaultValue="details" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="details">Primary panel</TabsContent>
        <TabsContent value="history">Audit trail</TabsContent>
      </Tabs>
    );

    expect(screen.getByText("Primary panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "data-slot",
      "tabs-trigger"
    );
    expect(document.querySelectorAll("[data-slot='tabs-content']")).toHaveLength(2);
  });

  it("renders drawer wrappers with header and footer slots", () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer title</DrawerTitle>
            <DrawerDescription>Drawer description</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>Dismiss</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );

    expect(screen.getByText("Open")).toHaveAttribute("data-slot", "drawer-trigger");
    expect(document.querySelector("[data-slot='drawer-overlay']")).not.toBeNull();
    expect(screen.getByText("Drawer title")).toHaveAttribute("data-slot", "drawer-title");
    expect(screen.getByText("Drawer description")).toHaveAttribute(
      "data-slot",
      "drawer-description"
    );
    expect(screen.getByText("Dismiss")).toHaveAttribute("data-slot", "drawer-close");
  });

  it("renders dropdown menu wrappers including nested and choice items", () => {
    render(
      <DropdownMenu open onOpenChange={vi.fn()}>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel inset>Actions</DropdownMenuLabel>
            <DropdownMenuItem>
              Rename
              <DropdownMenuShortcut>R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked>Pin</DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value="owner">
              <DropdownMenuRadioItem value="owner">Owner</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub open onOpenChange={vi.fn()}>
              <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByText("Open menu")).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    expect(screen.getByText("Actions")).toHaveAttribute("data-slot", "dropdown-menu-label");
    expect(screen.getByText("Rename")).toHaveAttribute("data-slot", "dropdown-menu-item");
    expect(screen.getByText("R")).toHaveAttribute("data-slot", "dropdown-menu-shortcut");
    expect(screen.getByText("Pin")).toHaveAttribute(
      "data-slot",
      "dropdown-menu-checkbox-item"
    );
    expect(screen.getByText("Owner")).toHaveAttribute("data-slot", "dropdown-menu-radio-item");
    expect(screen.getByText("More")).toHaveAttribute(
      "data-slot",
      "dropdown-menu-sub-trigger"
    );
    expect(screen.getByText("Delete")).toHaveAttribute("data-slot", "dropdown-menu-item");
  });
});
