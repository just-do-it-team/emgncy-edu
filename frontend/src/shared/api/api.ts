import axios from "axios";
import { SERVER_URL } from "@/shared/config";

export const api = axios.create({
  baseURL: SERVER_URL,
  withCredentials: false,
});
