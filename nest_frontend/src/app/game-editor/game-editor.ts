import {
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule }                    from '@angular/common';
import { FormsModule }                     from '@angular/forms';
import { ActivatedRoute, ParamMap }        from '@angular/router';
import {
  CdkDragEnd,
  CdkDragDrop,
  DragDropModule,
} from '@angular/cdk/drag-drop';

type PostType = 'automatic' | 'manual';
type AssetType = 'router' | 'firewall' | 'switch' | 'phone' | 'workstation' | 'cloud' | 'server';

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

interface TopoNode {
  id: string;
  type: AssetType;
  label: string;
  x: number;
  y: number;
  immutable?: boolean;
}

interface Edge {
  source: string;
  target: string;
}

@Component({
  selector: 'app-game-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './game-editor.html',
  styleUrls: ['./game-editor.scss']
})
export class GameEditor {
  @ViewChild('gridWrapper', { static: false }) gridWrapper!: ElementRef<HTMLElement>;

  activeTab: 'general' | 'invites' | 'CTF' | 'RvB' | 'Injects' = 'general';

  // General
  name = '';
  description = '';
  date = '';

  // Placeholder
  gameId = 0;

  // Invites
  searchTerm = '';
  allTeams = [
    'Team Alpha', 'Team Beta', 'Red Dragons',
    'Blue Whales', 'Gamma Group', 'Delta Force'
  ];
  invited: string[] = [];

  // Injects
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

  // RvB topology
  deviceTypes: AssetType[] = ['router', 'server'];
  nodes: TopoNode[] = [];
  private nextNodeId = 1;

  constructor(private route: ActivatedRoute) {
    this.route.paramMap.subscribe((mp: ParamMap) => {
      this.gameId = Number(mp.get('id'));
    });
  }

  // Tabs
  selectTab(tab: typeof this.activeTab) {
    this.activeTab = tab;
  }

  // Invites
  get filteredTeams(): string[] {
    const term = this.searchTerm.trim().toLowerCase();
    return term
      ? this.allTeams.filter(
          t => t.toLowerCase().includes(term) && !this.invited.includes(t)
        )
      : [];
  }
  inviteTeam(team: string) {
    this.invited.push(team);
    this.searchTerm = '';
  }
  removeInvite(team: string) {
    this.invited = this.invited.filter(t => t !== team);
  }

  // Injects
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
    if (this.editInjectIndex === i) {
      this.resetInjectForm();
    } else if (this.editInjectIndex > i) {
      this.editInjectIndex--;
    }
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

  // RvB drag & drop
  drop(event: CdkDragDrop<any>) {
    const data: any = event.item?.data;
    // If it's an existing node, skip creation
    if (data?.id) return;

    if (!data?.type) return;
    const rect = this.gridWrapper.nativeElement.getBoundingClientRect();
    const x = event.dropPoint.x - rect.left;
    const y = event.dropPoint.y - rect.top;
    this.nodes.push({
      id: `${this.nextNodeId++}`,
      type: data.type,
      label: data.type.toUpperCase(),
      x, y
    });
  }

  onNodeDragEnded(event: CdkDragEnd, node: TopoNode) {
    const rect = this.gridWrapper.nativeElement.getBoundingClientRect();
    node.x = event.source.getFreeDragPosition().x;
    node.y = event.source.getFreeDragPosition().y;
  }

  // Unused placeholders
  nothing() { return 0; }
  sendInvites() { return 0; }
  saveGeneral() { return 0; }
}
