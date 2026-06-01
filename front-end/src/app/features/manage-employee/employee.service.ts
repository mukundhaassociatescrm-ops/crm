import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Employee {
  _id?: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: string;
  status: boolean;
  mustCreatePassword?: boolean;
}

export interface EmployeeResponse {
  success: boolean;
  data: Employee | Employee[] | null;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  constructor(private http: HttpClient) {}

  getEmployees(): Observable<EmployeeResponse> {
    return this.http.get<EmployeeResponse>('/api/employees');
  }

  addEmployee(employee: Employee): Observable<EmployeeResponse> {
    return this.http.post<EmployeeResponse>('/api/employees', employee);
  }

  updateEmployee(id: string, employee: Employee): Observable<EmployeeResponse> {
    return this.http.put<EmployeeResponse>(`/api/employees/${id}`, employee);
  }

  deleteEmployee(id: string): Observable<EmployeeResponse> {
    return this.http.delete<EmployeeResponse>(`/api/employees/${id}`);
  }

  resetPassword(employeeId: string): Observable<{ success: boolean; message?: string }> {
    return this.http.post<{ success: boolean; message?: string }>(
      `/api/employees/${encodeURIComponent(employeeId)}/reset-password`,
      {},
    );
  }
}
