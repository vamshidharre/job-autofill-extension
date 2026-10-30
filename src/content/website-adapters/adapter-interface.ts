import { DetectedField, FieldMatchResult } from '../../types/engine';
import { UserProfile } from '../../types/profile';

export interface WebsiteAdapter {
  readonly name: string;
  isMatching(url: string, document: Document): boolean;
  detectCustomFields?(root: Document | HTMLElement): DetectedField[];
  customMatch?(field: DetectedField, profile: UserProfile): FieldMatchResult | null;
  customFill?(field: DetectedField, value: any): Promise<boolean>;
}
