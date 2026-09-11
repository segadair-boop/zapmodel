export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ApiToken: {
        Row: {
          active: boolean
          companyId: string
          createdAt: string
          id: string
          name: string
          tokenHash: string
        }
        Insert: {
          active?: boolean
          companyId: string
          createdAt?: string
          id: string
          name: string
          tokenHash: string
        }
        Update: {
          active?: boolean
          companyId?: string
          createdAt?: string
          id?: string
          name?: string
          tokenHash?: string
        }
        Relationships: [
          {
            foreignKeyName: "ApiToken_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      AuditLog: {
        Row: {
          action: string
          companyId: string
          createdAt: string
          details: Json | null
          entity: string
          entityId: string | null
          id: string
          userId: string | null
        }
        Insert: {
          action: string
          companyId: string
          createdAt?: string
          details?: Json | null
          entity: string
          entityId?: string | null
          id: string
          userId?: string | null
        }
        Update: {
          action?: string
          companyId?: string
          createdAt?: string
          details?: Json | null
          entity?: string
          entityId?: string | null
          id?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AuditLog_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "AuditLog_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Campaign: {
        Row: {
          companyId: string
          createdAt: string
          finishedAt: string | null
          id: string
          message: string
          name: string
          scheduledAt: string | null
          startedAt: string | null
          status: Database["public"]["Enums"]["CampaignStatus"]
          updatedAt: string
        }
        Insert: {
          companyId: string
          createdAt?: string
          finishedAt?: string | null
          id: string
          message: string
          name: string
          scheduledAt?: string | null
          startedAt?: string | null
          status?: Database["public"]["Enums"]["CampaignStatus"]
          updatedAt?: string
        }
        Update: {
          companyId?: string
          createdAt?: string
          finishedAt?: string | null
          id?: string
          message?: string
          name?: string
          scheduledAt?: string | null
          startedAt?: string | null
          status?: Database["public"]["Enums"]["CampaignStatus"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Campaign_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      CampaignContact: {
        Row: {
          campaignId: string
          contactId: string
          error: string | null
          status: string
        }
        Insert: {
          campaignId: string
          contactId: string
          error?: string | null
          status?: string
        }
        Update: {
          campaignId?: string
          contactId?: string
          error?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "CampaignContact_campaignId_fkey"
            columns: ["campaignId"]
            isOneToOne: false
            referencedRelation: "Campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "CampaignContact_contactId_fkey"
            columns: ["contactId"]
            isOneToOne: false
            referencedRelation: "Contact"
            referencedColumns: ["id"]
          },
        ]
      }
      Company: {
        Row: {
          active: boolean
          createdAt: string
          id: string
          name: string
          updatedAt: string
        }
        Insert: {
          active?: boolean
          createdAt?: string
          id: string
          name: string
          updatedAt?: string
        }
        Update: {
          active?: boolean
          createdAt?: string
          id?: string
          name?: string
          updatedAt?: string
        }
        Relationships: []
      }
      Contact: {
        Row: {
          avatarUrl: string | null
          companyId: string
          createdAt: string
          email: string | null
          id: string
          name: string
          notes: string | null
          number: string
          updatedAt: string
        }
        Insert: {
          avatarUrl?: string | null
          companyId: string
          createdAt?: string
          email?: string | null
          id: string
          name: string
          notes?: string | null
          number: string
          updatedAt?: string
        }
        Update: {
          avatarUrl?: string | null
          companyId?: string
          createdAt?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          number?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Contact_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      FileAsset: {
        Row: {
          companyId: string
          createdAt: string
          id: string
          mimeType: string
          name: string
          path: string
          size: number
        }
        Insert: {
          companyId: string
          createdAt?: string
          id: string
          mimeType: string
          name: string
          path: string
          size: number
        }
        Update: {
          companyId?: string
          createdAt?: string
          id?: string
          mimeType?: string
          name?: string
          path?: string
          size?: number
        }
        Relationships: [
          {
            foreignKeyName: "FileAsset_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      Message: {
        Row: {
          ack: number
          body: string | null
          createdAt: string
          externalId: string | null
          fromMe: boolean
          id: string
          mediaType: string | null
          mediaUrl: string | null
          ticketId: string
          updatedAt: string
          userId: string | null
        }
        Insert: {
          ack?: number
          body?: string | null
          createdAt?: string
          externalId?: string | null
          fromMe?: boolean
          id: string
          mediaType?: string | null
          mediaUrl?: string | null
          ticketId: string
          updatedAt?: string
          userId?: string | null
        }
        Update: {
          ack?: number
          body?: string | null
          createdAt?: string
          externalId?: string | null
          fromMe?: boolean
          id?: string
          mediaType?: string | null
          mediaUrl?: string | null
          ticketId?: string
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Message_ticketId_fkey"
            columns: ["ticketId"]
            isOneToOne: false
            referencedRelation: "Ticket"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Message_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Queue: {
        Row: {
          active: boolean
          color: string
          companyId: string
          createdAt: string
          greeting: string | null
          id: string
          name: string
          updatedAt: string
        }
        Insert: {
          active?: boolean
          color?: string
          companyId: string
          createdAt?: string
          greeting?: string | null
          id: string
          name: string
          updatedAt?: string
        }
        Update: {
          active?: boolean
          color?: string
          companyId?: string
          createdAt?: string
          greeting?: string | null
          id?: string
          name?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Queue_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      QuickMessage: {
        Row: {
          companyId: string
          createdAt: string
          id: string
          message: string
          shortcut: string
          updatedAt: string
        }
        Insert: {
          companyId: string
          createdAt?: string
          id: string
          message: string
          shortcut: string
          updatedAt?: string
        }
        Update: {
          companyId?: string
          createdAt?: string
          id?: string
          message?: string
          shortcut?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "QuickMessage_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      Schedule: {
        Row: {
          body: string | null
          companyId: string
          contactNumber: string | null
          createdAt: string
          id: string
          scheduledAt: string
          sentAt: string | null
          title: string
          updatedAt: string
          userId: string | null
        }
        Insert: {
          body?: string | null
          companyId: string
          contactNumber?: string | null
          createdAt?: string
          id: string
          scheduledAt: string
          sentAt?: string | null
          title: string
          updatedAt?: string
          userId?: string | null
        }
        Update: {
          body?: string | null
          companyId?: string
          contactNumber?: string | null
          createdAt?: string
          id?: string
          scheduledAt?: string
          sentAt?: string | null
          title?: string
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Schedule_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Schedule_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Setting: {
        Row: {
          companyId: string
          id: string
          key: string
          updatedAt: string
          value: string
        }
        Insert: {
          companyId: string
          id: string
          key: string
          updatedAt?: string
          value: string
        }
        Update: {
          companyId?: string
          id?: string
          key?: string
          updatedAt?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "Setting_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      Tag: {
        Row: {
          color: string
          companyId: string
          createdAt: string
          id: string
          name: string
          updatedAt: string
        }
        Insert: {
          color?: string
          companyId: string
          createdAt?: string
          id: string
          name: string
          updatedAt?: string
        }
        Update: {
          color?: string
          companyId?: string
          createdAt?: string
          id?: string
          name?: string
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Tag_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      Task: {
        Row: {
          companyId: string
          createdAt: string
          description: string | null
          dueAt: string | null
          id: string
          status: Database["public"]["Enums"]["TaskStatus"]
          title: string
          updatedAt: string
          userId: string | null
        }
        Insert: {
          companyId: string
          createdAt?: string
          description?: string | null
          dueAt?: string | null
          id: string
          status?: Database["public"]["Enums"]["TaskStatus"]
          title: string
          updatedAt?: string
          userId?: string | null
        }
        Update: {
          companyId?: string
          createdAt?: string
          description?: string | null
          dueAt?: string | null
          id?: string
          status?: Database["public"]["Enums"]["TaskStatus"]
          title?: string
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Task_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Task_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      Ticket: {
        Row: {
          companyId: string
          contactId: string
          createdAt: string
          id: string
          lastMessage: string | null
          queueId: string | null
          sessionId: string | null
          status: Database["public"]["Enums"]["TicketStatus"]
          unread: number
          updatedAt: string
          userId: string | null
        }
        Insert: {
          companyId: string
          contactId: string
          createdAt?: string
          id: string
          lastMessage?: string | null
          queueId?: string | null
          sessionId?: string | null
          status?: Database["public"]["Enums"]["TicketStatus"]
          unread?: number
          updatedAt?: string
          userId?: string | null
        }
        Update: {
          companyId?: string
          contactId?: string
          createdAt?: string
          id?: string
          lastMessage?: string | null
          queueId?: string | null
          sessionId?: string | null
          status?: Database["public"]["Enums"]["TicketStatus"]
          unread?: number
          updatedAt?: string
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Ticket_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Ticket_contactId_fkey"
            columns: ["contactId"]
            isOneToOne: false
            referencedRelation: "Contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Ticket_queueId_fkey"
            columns: ["queueId"]
            isOneToOne: false
            referencedRelation: "Queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Ticket_sessionId_fkey"
            columns: ["sessionId"]
            isOneToOne: false
            referencedRelation: "WhatsAppSession"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Ticket_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      TicketTag: {
        Row: {
          tagId: string
          ticketId: string
        }
        Insert: {
          tagId: string
          ticketId: string
        }
        Update: {
          tagId?: string
          ticketId?: string
        }
        Relationships: [
          {
            foreignKeyName: "TicketTag_tagId_fkey"
            columns: ["tagId"]
            isOneToOne: false
            referencedRelation: "Tag"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "TicketTag_ticketId_fkey"
            columns: ["ticketId"]
            isOneToOne: false
            referencedRelation: "Ticket"
            referencedColumns: ["id"]
          },
        ]
      }
      User: {
        Row: {
          active: boolean
          companyId: string
          createdAt: string
          email: string
          id: string
          name: string
          passwordHash: string
          role: Database["public"]["Enums"]["UserRole"]
          updatedAt: string
        }
        Insert: {
          active?: boolean
          companyId: string
          createdAt?: string
          email: string
          id: string
          name: string
          passwordHash: string
          role?: Database["public"]["Enums"]["UserRole"]
          updatedAt?: string
        }
        Update: {
          active?: boolean
          companyId?: string
          createdAt?: string
          email?: string
          id?: string
          name?: string
          passwordHash?: string
          role?: Database["public"]["Enums"]["UserRole"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "User_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
      WhatsAppSession: {
        Row: {
          companyId: string
          createdAt: string
          id: string
          isDefault: boolean
          name: string
          phone: string | null
          qr: string | null
          status: Database["public"]["Enums"]["ConnectionStatus"]
          updatedAt: string
        }
        Insert: {
          companyId: string
          createdAt?: string
          id: string
          isDefault?: boolean
          name: string
          phone?: string | null
          qr?: string | null
          status?: Database["public"]["Enums"]["ConnectionStatus"]
          updatedAt?: string
        }
        Update: {
          companyId?: string
          createdAt?: string
          id?: string
          isDefault?: boolean
          name?: string
          phone?: string | null
          qr?: string | null
          status?: Database["public"]["Enums"]["ConnectionStatus"]
          updatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "WhatsAppSession_companyId_fkey"
            columns: ["companyId"]
            isOneToOne: false
            referencedRelation: "Company"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      CampaignStatus:
        | "DRAFT"
        | "SCHEDULED"
        | "RUNNING"
        | "PAUSED"
        | "FINISHED"
        | "CANCELLED"
      ConnectionStatus:
        | "DISCONNECTED"
        | "CONNECTING"
        | "QRCODE"
        | "CONNECTED"
        | "ERROR"
      TaskStatus: "TODO" | "DOING" | "DONE"
      TicketStatus: "OPEN" | "PENDING" | "CLOSED"
      UserRole: "OWNER" | "ADMIN" | "AGENT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      CampaignStatus: [
        "DRAFT",
        "SCHEDULED",
        "RUNNING",
        "PAUSED",
        "FINISHED",
        "CANCELLED",
      ],
      ConnectionStatus: [
        "DISCONNECTED",
        "CONNECTING",
        "QRCODE",
        "CONNECTED",
        "ERROR",
      ],
      TaskStatus: ["TODO", "DOING", "DONE"],
      TicketStatus: ["OPEN", "PENDING", "CLOSED"],
      UserRole: ["OWNER", "ADMIN", "AGENT"],
    },
  },
} as const
