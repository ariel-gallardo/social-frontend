import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

type UploadFolder = 'chat' | 'profile';

interface UploadResponse {
  key: string;
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private readonly uploadUrl = 'http://localhost:8080/api/uploads';

  constructor(private http: HttpClient) {}

  uploadImage(file: File, folder: UploadFolder): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const token = localStorage.getItem('social_auth_token') ?? '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.post<UploadResponse>(this.uploadUrl, formData, { headers });
  }
}
