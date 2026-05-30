import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export const POSTER_CATEGORIES = [
  'Income Tax',
  'GST',
  'Audit',
  'TDS',
  'General Announcement',
  'Other',
] as const;

export type PosterCategory = (typeof POSTER_CATEGORIES)[number];

export interface Poster {
  _id: string;
  title: string;
  slug: string;
  imageUrl: string;
  imageFilename?: string;
  category: PosterCategory | string;
  shortDescription: string;
  content?: string;
  isActive: boolean;
  viewCount: number;
  landingPath?: string;
  landingUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PosterPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PosterListResponse {
  success: boolean;
  data: Poster[];
  pagination?: PosterPagination;
  message?: string;
}

export interface PublicPoster {
  title: string;
  slug: string;
  imageUrl: string;
  category: string;
  shortDescription: string;
  content: string;
  viewCount: number;
}

@Injectable({ providedIn: 'root' })
export class PosterService {
  private readonly api = '/api/posters';

  constructor(private readonly http: HttpClient) {}

  getCategories(): Observable<{ success: boolean; data: string[] }> {
    return this.http.get<{ success: boolean; data: string[] }>(`${this.api}/categories`);
  }

  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
  } = {}): Observable<PosterListResponse> {
    let httpParams = new HttpParams();
    if (params.page) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.limit) {
      httpParams = httpParams.set('limit', String(params.limit));
    }
    if (params.search?.trim()) {
      httpParams = httpParams.set('search', params.search.trim());
    }
    if (params.category?.trim()) {
      httpParams = httpParams.set('category', params.category.trim());
    }
    return this.http.get<PosterListResponse>(this.api, { params: httpParams });
  }

  listActive(): Observable<{ success: boolean; data: Poster[] }> {
    return this.http.get<{ success: boolean; data: Poster[] }>(`${this.api}/active`);
  }

  getById(id: string): Observable<{ success: boolean; data: Poster }> {
    return this.http.get<{ success: boolean; data: Poster }>(`${this.api}/${encodeURIComponent(id)}`);
  }

  getPublicBySlug(slug: string): Observable<{ success: boolean; data: PublicPoster }> {
    return this.http.get<{ success: boolean; data: PublicPoster }>(
      `${this.api}/public/${encodeURIComponent(slug)}`,
    );
  }

  create(formData: FormData): Observable<{ success: boolean; data: Poster; message?: string }> {
    return this.http.post<{ success: boolean; data: Poster; message?: string }>(this.api, formData);
  }

  update(id: string, formData: FormData): Observable<{ success: boolean; data: Poster; message?: string }> {
    return this.http.put<{ success: boolean; data: Poster; message?: string }>(
      `${this.api}/${encodeURIComponent(id)}`,
      formData,
    );
  }

  setStatus(id: string, isActive: boolean): Observable<{ success: boolean; data: Poster }> {
    return this.http.patch<{ success: boolean; data: Poster }>(
      `${this.api}/${encodeURIComponent(id)}/status`,
      { isActive },
    );
  }

  delete(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>(
      `${this.api}/${encodeURIComponent(id)}`,
    );
  }

  /** Public landing page URL for campaigns (SPA route). */
  buildLandingUrl(slug: string): string {
    const base = String(environment.publicSiteUrl || window.location.origin).replace(/\/$/, '');
    return `${base}/posters/${encodeURIComponent(slug)}`;
  }
}
