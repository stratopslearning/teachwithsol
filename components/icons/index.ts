"use client";

/**
 * App icon barrel — lucide-animated where available, Lucide fallback otherwise.
 * Prefer importing from "@/components/icons" instead of "lucide-react".
 */

import { adaptAnimatedIcon, adaptStaticIcon } from "@/components/icons/adapt";

import { Link2Icon as Link2IconRaw } from "@/components/icons/link-2";

import { ArchiveIcon as ArchiveIconRaw } from "@/components/icons/archive";
import { ArrowDownIcon as ArrowDownIconRaw } from "@/components/icons/arrow-down";
import { ArrowDownRightIcon as ArrowDownRightIconRaw } from "@/components/icons/arrow-down-right";
import { ArrowLeftIcon as ArrowLeftIconRaw } from "@/components/icons/arrow-left";
import { ArrowRightIcon as ArrowRightIconRaw } from "@/components/icons/arrow-right";
import { ArrowUpIcon as ArrowUpIconRaw } from "@/components/icons/arrow-up";
import { ArrowUpRightIcon as ArrowUpRightIconRaw } from "@/components/icons/arrow-up-right";
import { AttachFileIcon as AttachFileIconRaw } from "@/components/icons/attach-file";
import { BadgeAlertIcon as BadgeAlertIconRaw } from "@/components/icons/badge-alert";
import { BookTextIcon as BookTextIconRaw } from "@/components/icons/book-text";
import { BoxIcon as BoxIconRaw } from "@/components/icons/box";
import { CalendarDaysIcon as CalendarDaysIconRaw } from "@/components/icons/calendar-days";
import { ChartColumnIncreasingIcon as ChartColumnIncreasingIconRaw } from "@/components/icons/chart-column-increasing";
import { ChartLineIcon as ChartLineIconRaw } from "@/components/icons/chart-line";
import { ChartNoAxesColumnIncreasingIcon as ChartNoAxesColumnIncreasingIconRaw } from "@/components/icons/chart-no-axes-column-increasing";
import { CheckIcon as CheckIconRaw } from "@/components/icons/check";
import { ChevronDownIcon as ChevronDownIconRaw } from "@/components/icons/chevron-down";
import { ChevronLeftIcon as ChevronLeftIconRaw } from "@/components/icons/chevron-left";
import { ChevronRightIcon as ChevronRightIconRaw } from "@/components/icons/chevron-right";
import { ChevronUpIcon as ChevronUpIconRaw } from "@/components/icons/chevron-up";
import { CircleCheckIcon as CircleCheckIconRaw } from "@/components/icons/circle-check";
import { CircleDashedIcon as CircleDashedIconRaw } from "@/components/icons/circle-dashed";
import { ClipboardCheckIcon as ClipboardCheckIconRaw } from "@/components/icons/clipboard-check";
import { ClockIcon as ClockIconRaw } from "@/components/icons/clock";
import { CopyIcon as CopyIconRaw } from "@/components/icons/copy";
import { CreditCardIcon as CreditCardIconRaw } from "@/components/icons/credit-card";
import { DownloadIcon as DownloadIconRaw } from "@/components/icons/download";
import { ExternalLinkIcon as ExternalLinkIconRaw } from "@/components/icons/external-link";
import { EyeIcon as EyeIconRaw } from "@/components/icons/eye";
import { EyeOffIcon as EyeOffIconRaw } from "@/components/icons/eye-off";
import { FilePenLineIcon as FilePenLineIconRaw } from "@/components/icons/file-pen-line";
import { FileStackIcon as FileStackIconRaw } from "@/components/icons/file-stack";
import { FileTextIcon as FileTextIconRaw } from "@/components/icons/file-text";
import { FolderArchiveIcon as FolderArchiveIconRaw } from "@/components/icons/folder-archive";
import { FolderOpenIcon as FolderOpenIconRaw } from "@/components/icons/folder-open";
import { FoldersIcon as FoldersIconRaw } from "@/components/icons/folders";
import { GraduationCapIcon as GraduationCapIconRaw } from "@/components/icons/graduation-cap";
import { GripVerticalIcon as GripVerticalIconRaw } from "@/components/icons/grip-vertical";
import { HistoryIcon as HistoryIconRaw } from "@/components/icons/history";
import { HourglassIcon as HourglassIconRaw } from "@/components/icons/hourglass";
import { KeyCircleIcon as KeyCircleIconRaw } from "@/components/icons/key-circle";
import { LayersIcon as LayersIconRaw } from "@/components/icons/layers";
import { LayoutGridIcon as LayoutGridIconRaw } from "@/components/icons/layout-grid";
import { LockIcon as LockIconRaw } from "@/components/icons/lock";
import { LogoutIcon as LogoutIconRaw } from "@/components/icons/logout";
import { MailCheckIcon as MailCheckIconRaw } from "@/components/icons/mail-check";
import { MenuIcon as MenuIconRaw } from "@/components/icons/menu";
import { MessageSquareIcon as MessageSquareIconRaw } from "@/components/icons/message-square";
import { MessageSquareMoreIcon as MessageSquareMoreIconRaw } from "@/components/icons/message-square-more";
import { MonitorCogIcon as MonitorCogIconRaw } from "@/components/icons/monitor-cog";
import { MoonIcon as MoonIconRaw } from "@/components/icons/moon";
import { PanelLeftOpenIcon as PanelLeftOpenIconRaw } from "@/components/icons/panel-left-open";
import { PlugZapIcon as PlugZapIconRaw } from "@/components/icons/plug-zap";
import { PlusIcon as PlusIconRaw } from "@/components/icons/plus";
import { ReceiptTextIcon as ReceiptTextIconRaw } from "@/components/icons/receipt-text";
import { RefreshCWIcon as RefreshCWIconRaw } from "@/components/icons/refresh-cw";
import { RotateCCWIcon as RotateCCWIconRaw } from "@/components/icons/rotate-ccw";
import { SearchIcon as SearchIconRaw } from "@/components/icons/search";
import { SendIcon as SendIconRaw } from "@/components/icons/send";
import { ServerCrashIcon as ServerCrashIconRaw } from "@/components/icons/server-crash";
import { ShieldCheckIcon as ShieldCheckIconRaw } from "@/components/icons/shield-check";
import { SparklesIcon as SparklesIconRaw } from "@/components/icons/sparkles";
import { SquarePenIcon as SquarePenIconRaw } from "@/components/icons/square-pen";
import { SunIcon as SunIconRaw } from "@/components/icons/sun";
import { TrendingUpIcon as TrendingUpIconRaw } from "@/components/icons/trending-up";
import { UploadIcon as UploadIconRaw } from "@/components/icons/upload";
import { UsersIcon as UsersIconRaw } from "@/components/icons/users";
import { XIcon as XIconRaw } from "@/components/icons/x";
import {
  ArchiveRestore as ArchiveRestoreStatic,
  Award as AwardStatic,
  Building2 as Building2Static,
  Circle as CircleStatic,
  CircleIcon as CircleIconStatic,
  FileSpreadsheet as FileSpreadsheetStatic,
  Focus as FocusStatic,
  Gift as GiftStatic,
  ImageIcon as ImageIconStatic,
  List as ListStatic,
  Loader2 as Loader2Static,
  Minus as MinusStatic,
  MinusIcon as MinusIconStatic,
  MoreHorizontal as MoreHorizontalStatic,
  MoreHorizontalIcon as MoreHorizontalIconStatic,
  Puzzle as PuzzleStatic,
  Save as SaveStatic,
  Square as SquareStatic,
  Target as TargetStatic,
  TextCursorInput as TextCursorInputStatic,
  Trash2 as Trash2Static,
  Type as TypeStatic,
  XCircle as XCircleStatic,
} from "lucide-react";

export type { LucideIcon, LucideProps } from "lucide-react";
export { IconInteractionProvider } from "@/components/icons/IconInteractionProvider";
export type { AnimatedIconHandle } from "@/components/icons/runtime";

export const AlertCircle = adaptAnimatedIcon(BadgeAlertIconRaw, "AlertCircle");
export const AlertTriangle = adaptAnimatedIcon(BadgeAlertIconRaw, "AlertTriangle");
export const Archive = adaptAnimatedIcon(ArchiveIconRaw, "Archive");
export const ArrowDown = adaptAnimatedIcon(ArrowDownIconRaw, "ArrowDown");
export const ArrowDownRight = adaptAnimatedIcon(ArrowDownRightIconRaw, "ArrowDownRight");
export const ArrowLeft = adaptAnimatedIcon(ArrowLeftIconRaw, "ArrowLeft");
export const ArrowRight = adaptAnimatedIcon(ArrowRightIconRaw, "ArrowRight");
export const ArrowUp = adaptAnimatedIcon(ArrowUpIconRaw, "ArrowUp");
export const ArrowUpRight = adaptAnimatedIcon(ArrowUpRightIconRaw, "ArrowUpRight");
export const BarChart2 = adaptAnimatedIcon(ChartNoAxesColumnIncreasingIconRaw, "BarChart2");
export const BarChart3 = adaptAnimatedIcon(ChartColumnIncreasingIconRaw, "BarChart3");
export const BookOpen = adaptAnimatedIcon(BookTextIconRaw, "BookOpen");
export const Calendar = adaptAnimatedIcon(CalendarDaysIconRaw, "Calendar");
export const CalendarDays = adaptAnimatedIcon(CalendarDaysIconRaw, "CalendarDays");
export const CalendarIcon = adaptAnimatedIcon(CalendarDaysIconRaw, "CalendarIcon");
export const Check = adaptAnimatedIcon(CheckIconRaw, "Check");
export const CheckCircle = adaptAnimatedIcon(CircleCheckIconRaw, "CheckCircle");
export const CheckCircle2 = adaptAnimatedIcon(CircleCheckIconRaw, "CheckCircle2");
export const CheckIcon = adaptAnimatedIcon(CheckIconRaw, "CheckIcon");
export const ChevronDown = adaptAnimatedIcon(ChevronDownIconRaw, "ChevronDown");
export const ChevronDownIcon = adaptAnimatedIcon(ChevronDownIconRaw, "ChevronDownIcon");
export const ChevronLeft = adaptAnimatedIcon(ChevronLeftIconRaw, "ChevronLeft");
export const ChevronLeftIcon = adaptAnimatedIcon(ChevronLeftIconRaw, "ChevronLeftIcon");
export const ChevronRight = adaptAnimatedIcon(ChevronRightIconRaw, "ChevronRight");
export const ChevronRightIcon = adaptAnimatedIcon(ChevronRightIconRaw, "ChevronRightIcon");
export const ChevronUpIcon = adaptAnimatedIcon(ChevronUpIconRaw, "ChevronUpIcon");
export const CircleDashed = adaptAnimatedIcon(CircleDashedIconRaw, "CircleDashed");
export const ClipboardList = adaptAnimatedIcon(ClipboardCheckIconRaw, "ClipboardList");
export const Clock = adaptAnimatedIcon(ClockIconRaw, "Clock");
export const Copy = adaptAnimatedIcon(CopyIconRaw, "Copy");
export const CreditCard = adaptAnimatedIcon(CreditCardIconRaw, "CreditCard");
export const Download = adaptAnimatedIcon(DownloadIconRaw, "Download");
export const Edit = adaptAnimatedIcon(SquarePenIconRaw, "Edit");
export const ExternalLink = adaptAnimatedIcon(ExternalLinkIconRaw, "ExternalLink");
export const Eye = adaptAnimatedIcon(EyeIconRaw, "Eye");
export const EyeOff = adaptAnimatedIcon(EyeOffIconRaw, "EyeOff");
export const FileArchive = adaptAnimatedIcon(FolderArchiveIconRaw, "FileArchive");
export const FileStack = adaptAnimatedIcon(FileStackIconRaw, "FileStack");
export const FileText = adaptAnimatedIcon(FileTextIconRaw, "FileText");
export const Folder = adaptAnimatedIcon(FolderOpenIconRaw, "Folder");
export const FolderOpen = adaptAnimatedIcon(FolderOpenIconRaw, "FolderOpen");
export const GraduationCap = adaptAnimatedIcon(GraduationCapIconRaw, "GraduationCap");
export const GripVertical = adaptAnimatedIcon(GripVerticalIconRaw, "GripVertical");
export const GripVerticalIcon = adaptAnimatedIcon(GripVerticalIconRaw, "GripVerticalIcon");
export const History = adaptAnimatedIcon(HistoryIconRaw, "History");
export const Hourglass = adaptAnimatedIcon(HourglassIconRaw, "Hourglass");
export const KeyRound = adaptAnimatedIcon(KeyCircleIconRaw, "KeyRound");
export const Layers = adaptAnimatedIcon(LayersIconRaw, "Layers");
export const LayoutDashboard = adaptAnimatedIcon(LayoutGridIconRaw, "LayoutDashboard");
export const LineChart = adaptAnimatedIcon(ChartLineIconRaw, "LineChart");
export const Lock = adaptAnimatedIcon(LockIconRaw, "Lock");
export const LogOut = adaptAnimatedIcon(LogoutIconRaw, "LogOut");
export const Mail = adaptAnimatedIcon(MailCheckIconRaw, "Mail");
export const Menu = adaptAnimatedIcon(MenuIconRaw, "Menu");
export const MessageSquare = adaptAnimatedIcon(MessageSquareIconRaw, "MessageSquare");
export const MessagesSquare = adaptAnimatedIcon(MessageSquareMoreIconRaw, "MessagesSquare");
export const Monitor = adaptAnimatedIcon(MonitorCogIconRaw, "Monitor");
export const Moon = adaptAnimatedIcon(MoonIconRaw, "Moon");
export const Package = adaptAnimatedIcon(BoxIconRaw, "Package");
export const PanelLeftIcon = adaptAnimatedIcon(PanelLeftOpenIconRaw, "PanelLeftIcon");
export const Paperclip = adaptAnimatedIcon(AttachFileIconRaw, "Paperclip");
export const PenLine = adaptAnimatedIcon(FilePenLineIconRaw, "PenLine");
export const Pencil = adaptAnimatedIcon(SquarePenIconRaw, "Pencil");
export const Plug = adaptAnimatedIcon(PlugZapIconRaw, "Plug");
export const Plus = adaptAnimatedIcon(PlusIconRaw, "Plus");
export const RefreshCw = adaptAnimatedIcon(RefreshCWIconRaw, "RefreshCw");
export const RotateCcw = adaptAnimatedIcon(RotateCCWIconRaw, "RotateCcw");
export const ScrollText = adaptAnimatedIcon(ReceiptTextIconRaw, "ScrollText");
export const Search = adaptAnimatedIcon(SearchIconRaw, "Search");
export const SearchIcon = adaptAnimatedIcon(SearchIconRaw, "SearchIcon");
export const Send = adaptAnimatedIcon(SendIconRaw, "Send");
export const ServerCrash = adaptAnimatedIcon(ServerCrashIconRaw, "ServerCrash");
export const Shield = adaptAnimatedIcon(ShieldCheckIconRaw, "Shield");
export const ShieldCheck = adaptAnimatedIcon(ShieldCheckIconRaw, "ShieldCheck");
export const Sparkles = adaptAnimatedIcon(SparklesIconRaw, "Sparkles");
export const SquareArrowOutUpRight = adaptAnimatedIcon(ExternalLinkIconRaw, "SquareArrowOutUpRight");
export const Sun = adaptAnimatedIcon(SunIconRaw, "Sun");
export const TrendingUp = adaptAnimatedIcon(TrendingUpIconRaw, "TrendingUp");
export const Upload = adaptAnimatedIcon(UploadIconRaw, "Upload");
export const Users = adaptAnimatedIcon(UsersIconRaw, "Users");
export const X = adaptAnimatedIcon(XIconRaw, "X");
export const XIcon = adaptAnimatedIcon(XIconRaw, "XIcon");
export const ArchiveRestore = adaptStaticIcon(ArchiveRestoreStatic, "ArchiveRestore");
export const Award = adaptStaticIcon(AwardStatic, "Award");
export const Building2 = adaptStaticIcon(Building2Static, "Building2");
export const Circle = adaptStaticIcon(CircleStatic, "Circle");
export const CircleIcon = adaptStaticIcon(CircleIconStatic, "CircleIcon");
export const FileSpreadsheet = adaptStaticIcon(FileSpreadsheetStatic, "FileSpreadsheet");
export const Focus = adaptStaticIcon(FocusStatic, "Focus");
export const Gift = adaptStaticIcon(GiftStatic, "Gift");
export const ImageIcon = adaptStaticIcon(ImageIconStatic, "ImageIcon");
export const Library = adaptAnimatedIcon(FoldersIconRaw, "Library");
export const Link2 = adaptAnimatedIcon(Link2IconRaw, "Link2");
export const List = adaptStaticIcon(ListStatic, "List");
export const Loader2 = adaptStaticIcon(Loader2Static, "Loader2");
export const Minus = adaptStaticIcon(MinusStatic, "Minus");
export const MinusIcon = adaptStaticIcon(MinusIconStatic, "MinusIcon");
export const MoreHorizontal = adaptStaticIcon(MoreHorizontalStatic, "MoreHorizontal");
export const MoreHorizontalIcon = adaptStaticIcon(MoreHorizontalIconStatic, "MoreHorizontalIcon");
export const Puzzle = adaptStaticIcon(PuzzleStatic, "Puzzle");
export const Save = adaptStaticIcon(SaveStatic, "Save");
export const Square = adaptStaticIcon(SquareStatic, "Square");
export const Target = adaptStaticIcon(TargetStatic, "Target");
export const TextCursorInput = adaptStaticIcon(TextCursorInputStatic, "TextCursorInput");
export const Trash2 = adaptStaticIcon(Trash2Static, "Trash2");
export const Type = adaptStaticIcon(TypeStatic, "Type");
export const XCircle = adaptStaticIcon(XCircleStatic, "XCircle");
