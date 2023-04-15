import Uploader from './uploader';
export type Trigger = Readonly<{
    clickTrigger: (event: MouseEvent) => void;
    dragEnterTrigger: (event: DragEvent) => void;
    dragOverTrigger: (event: DragEvent) => void;
    dragLeaveTrigger: (event: DragEvent) => void;
    dropTrigger: (event: DragEvent) => void;
}>;
export declare const createTrigger: (uploader: Uploader) => Trigger;
