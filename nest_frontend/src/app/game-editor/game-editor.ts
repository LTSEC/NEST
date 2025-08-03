import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';

type PostType = 'automatic' | 'manual';

interface Inject {
  id: number;
  name: string;
  postType: PostType;
  postTimeHours?: number;
  postTimeMinutes?: number;
  description: string;
  points: number;
  attachments: File[];
}

type AssetType = 'router'|'firewall'|'switch'|'phone'|'workstation'|'cloud';
interface Node {
  id: string;
  type: AssetType;
  label: string;
  x: number; // px from left
  y: number; // px from top
  immutable?: boolean;
}
interface Edge { source: string; target: string; }

@Component({
  selector: 'app-game-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './game-editor.html',
  styleUrls: ['./game-editor.scss']
})
export class GameEditor {
  @ViewChild('gridEl', { static: true }) gridEl!: ElementRef<HTMLElement>;
  @ViewChild('gridWrapper', { static: true }) gridWrapper!: ElementRef<HTMLElement>;

  gameId!: number;
  activeTab: 'general' | 'invites' | 'CTF' | 'RvB' | 'Injects' = 'general';

  // --- General fields (stub) ---
  name = '';
  description = '';
  date = '';

  // --- Placeholder invites data ---
  searchTerm = '';
  allTeams = [
    'Team Alpha',
    'Team Beta',
    'Red Dragons',
    'Blue Whales',
    'Gamma Group',
    'Delta Force'
  ];
  invited: string[] = [];

  constructor(private route: ActivatedRoute) {
    this.route.paramMap.subscribe(mp => {
      this.gameId = Number(mp.get('id'));
      // TODO: load real game
    });
  }

  get filteredTeams(): string[] {
    const term = this.searchTerm.trim().toLowerCase();
    return term
      ? this.allTeams.filter(t => t.toLowerCase().includes(term) && !this.invited.includes(t))
      : [];
  }

  inviteTeam(team: string) {
    this.invited.push(team);
    this.searchTerm = '';
  }

  removeInvite(team: string) {
    this.invited = this.invited.filter(t => t !== team);
  }

  selectTab(tab: typeof this.activeTab) {
    this.activeTab = tab;
    console.log(this.activeTab)
  }

  saveGeneral() { /* ... */ }
  sendInvites() { /* ... */ }
  
  // INJECT SECTION

  injects: Inject[] = [];
  newInject: Inject = {
    id: 0,
    name: '',
    postType: 'manual',
    postTimeHours: 0,
    postTimeMinutes: 0,
    description: '',
    points: 0,
    attachments: []
  };
  editInjectIndex = -1;

  onFilesSelected(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files) this.newInject.attachments = Array.from(files);
  }

  addOrUpdateInject() {
    if (this.editInjectIndex > -1) {
      this.injects[this.editInjectIndex] = { ...this.newInject };
    } else {
      this.injects.push({ ...this.newInject, id: Date.now() });
    }
    this.resetInjectForm();
  }

  editInject(i: number) {
    this.newInject = { ...this.injects[i] };
    this.editInjectIndex = i;
  }

  deleteInject(i: number) {
    this.injects.splice(i, 1);
    if (this.editInjectIndex === i) this.resetInjectForm();
    else if (this.editInjectIndex > i) this.editInjectIndex--;
  }

  nothing() {
    console.log("Nothing")
  }

  private resetInjectForm() {
    this.newInject = {
      id: 0,
      name: '',
      postType: 'manual',
      postTimeHours: 0,
      postTimeMinutes: 0,
      description: '',
      points: 0,
      attachments: []
    };
    this.editInjectIndex = -1;
  }

  // RvB SECTION

  panX = 0;
  panY = 0;
  isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private pointerStartX = 0;
  private pointerStartY = 0;

  palette: { type: AssetType; label: string }[] = [
    { type:'router', label:'Router' },
    { type:'firewall', label:'Firewall' },
    { type:'switch', label:'Switch' },
    { type:'phone', label:'Phone' },
    { type:'workstation', label:'Workstation' },
  ];

  readonly GRID_WIDTH  = 2400;
  readonly GRID_HEIGHT = 1200;

  ngAfterViewInit() {
    // Center the GRID (pane) within the WRAPPER on init
    const cw = this.gridWrapper.nativeElement.clientWidth;
    const ch = this.gridWrapper.nativeElement.clientHeight;
    this.panX = (cw - this.GRID_WIDTH)  / 2;
    this.panY = (ch - this.GRID_HEIGHT) / 2;
  }

  // prepopulated nodes from the example diagram
  nodes: Node[] = [
    // Left network
    { id:'routerL', type:'router',      label:'Router',      x: 50,  y:  50, immutable:true },
    { id:'firewallL',type:'firewall',   label:'Firewall',    x: 50,  y: 150, immutable:true },
    { id:'switchL',  type:'switch',     label:'Switch',      x: 50,  y: 250, immutable:true },
    { id:'phoneL1',  type:'phone',      label:'Phone',       x: 10,  y: 350, immutable:true },
    { id:'phoneL2',  type:'phone',      label:'Phone',       x: 50,  y: 350, immutable:true },
    { id:'phoneL3',  type:'phone',      label:'Phone',       x: 90,  y: 350, immutable:true },
    { id:'pcL1',     type:'workstation',label:'PC',          x: 10,  y: 450, immutable:true },
    { id:'pcL2',     type:'workstation',label:'PC',          x: 50,  y: 450, immutable:true },
    { id:'pcL3',     type:'workstation',label:'PC',          x: 90,  y: 450, immutable:true },

    // Center network
    { id:'cloud',    type:'cloud',      label:'Internet',    x: 300, y:  50, immutable:true },
    { id:'routerC',  type:'router',     label:'Router',      x: 300, y: 150, immutable:true },
    { id:'firewallC',type:'firewall',   label:'Firewall',    x: 300, y: 250, immutable:true },
    { id:'workC',    type:'workstation',label:'Workstation', x: 300, y: 350, immutable:true },

    // Right network
    { id:'routerR',  type:'router',     label:'Router',      x: 550, y:  50, immutable:true },
    { id:'laptopR',  type:'workstation',label:'Laptop',      x: 650, y:  20, immutable:true },
    { id:'phoneR',   type:'phone',      label:'Phone',       x: 650, y:  80, immutable:true },
    { id:'firewallR',type:'firewall',   label:'Firewall',    x: 550, y: 150, immutable:true },
    { id:'switchR',  type:'switch',     label:'Switch',      x: 550, y: 250, immutable:true },
    { id:'workR1',   type:'workstation',label:'Workstation', x: 650, y: 220, immutable:true },
    { id:'workR2',   type:'workstation',label:'Workstation', x: 650, y: 300, immutable:true },
    { id:'pcR',      type:'workstation',label:'PC',          x: 650, y: 380, immutable:true },
  ];

  // connections between those nodes
  edges: Edge[] = [
    // Left
    { source:'routerL',   target:'firewallL' },
    { source:'firewallL', target:'switchL' },
    { source:'switchL',   target:'phoneL1' },
    { source:'switchL',   target:'phoneL2' },
    { source:'switchL',   target:'phoneL3' },
    { source:'phoneL1',   target:'pcL1' },
    { source:'phoneL2',   target:'pcL2' },
    { source:'phoneL3',   target:'pcL3' },

    // Center
    { source:'cloud',     target:'routerC' },
    { source:'routerC',   target:'firewallC' },
    { source:'firewallC', target:'workC' },

    // Right
    { source:'routerR',   target:'laptopR' },
    { source:'routerR',   target:'phoneR' },
    { source:'cloud',     target:'routerR' },
    { source:'routerR',   target:'firewallR' },
    { source:'firewallR', target:'switchR' },
    { source:'switchR',   target:'workR1' },
    { source:'switchR',   target:'workR2' },
    { source:'switchR',   target:'pcR' },
  ];

  // snap grid size (in px)
  gridSize = 50;

  // drop from palette
  onDrop(evt: CdkDragDrop<any>) {
    const pt = evt.dropPoint;
    const rect = this.gridEl.nativeElement.getBoundingClientRect();
    // Adjust for pan
    let x = pt.x - rect.left - this.panX;
    let y = pt.y - rect.top  - this.panY;
    // Snap
    x = Math.round(x / this.gridSize) * this.gridSize;
    y = Math.round(y / this.gridSize) * this.gridSize;

    const asset = evt.item.data as { type: AssetType; label: string };
    this.nodes.push({
      id: `${asset.type}-${Date.now()}`,
      ...asset,
      x, y
    });
  }

  // helpers for SVG edge coords
  private findNode(id: string) {
    return this.nodes.find(n => n.id === id)!;
  }
  xOf(id: string) {
    return this.nodes.find(n => n.id === id)!.x + 40;
  }
  yOf(id: string) {
    return this.nodes.find(n => n.id === id)!.y + 20;
  }

  startPan(event: MouseEvent) {
    if (event.button !== 0) return;           // only left button
    this.isPanning = true;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onPointerMove(evt: MouseEvent) {
    if (!this.isPanning) return;
    let newX = this.panStartX + (evt.clientX - this.pointerStartX);
    let newY = this.panStartY + (evt.clientY - this.pointerStartY);

    // Clamp to [wrapperSize - gridSize, 0]
    const cw = this.gridWrapper.nativeElement.clientWidth;
    const ch = this.gridWrapper.nativeElement.clientHeight;
    const gw = this.gridEl.nativeElement.offsetWidth;
    const gh = this.gridEl.nativeElement.offsetHeight;

    newX = Math.min(0, Math.max(cw - gw, newX));
    newY = Math.min(0, Math.max(ch - gh, newY));

    this.panX = newX;
    this.panY = newY;
  }

  @HostListener('window:mouseup', ['$event'])
  endPan(evt: MouseEvent) {
    if (evt.button === 0) this.isPanning = false;
  }

}
