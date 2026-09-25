from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator, Mapping
from urllib.parse import quote

import httpx
from fastapi import UploadFile

from s112.common.config import Settings


class AudioStorageError(RuntimeError):
    pass


class AudioTooLargeError(AudioStorageError):
    pass


class InvalidAudioError(AudioStorageError):
    pass


@dataclass(frozen=True, slots=True)
class StoredAudioObject:
    object_key: str
    etag: str | None
    sha256: str
    size_bytes: int
    content_type: str


@dataclass(frozen=True, slots=True)
class StoredObjectEntry:
    object_key: str
    modified_at: datetime


class SeaweedStorage:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not settings.seaweed_filers:
            raise ValueError("At least one SeaweedFS filer URL is required")
        self.settings = settings
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.seaweed_timeout_seconds, connect=5.0)
        )
        self._owns_client = client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def upload_file(
        self,
        object_key: str,
        upload: UploadFile,
        *,
        content_type: str,
        metadata: Mapping[str, str] | None = None,
    ) -> StoredAudioObject:
        digest = hashlib.sha256()
        size_bytes = 0
        header = bytearray()
        while chunk := await upload.read(1024 * 1024):
            size_bytes += len(chunk)
            if size_bytes > self.settings.audio_max_upload_bytes:
                await upload.seek(0)
                raise AudioTooLargeError(
                    "Audio file exceeds the configured upload size limit"
                )
            if len(header) < 16:
                header.extend(chunk[: 16 - len(header)])
            digest.update(chunk)
        await upload.seek(0)
        if size_bytes == 0:
            raise InvalidAudioError("Audio file is empty")
        if not _matches_audio_type(bytes(header), content_type):
            raise InvalidAudioError(
                "Audio content does not match the declared content type"
            )
        checksum = digest.hexdigest()
        headers = _upload_headers(content_type, metadata, checksum)

        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            await upload.seek(0)

            async def chunks() -> AsyncIterator[bytes]:
                while chunk := await upload.read(1024 * 1024):
                    yield chunk

            try:
                response = await self._client.put(
                    self._url(filer_url, object_key),
                    content=chunks(),
                    headers=headers,
                )
                response.raise_for_status()
                return StoredAudioObject(
                    object_key=object_key,
                    etag=self._etag(response),
                    sha256=checksum,
                    size_bytes=size_bytes,
                    content_type=content_type,
                )
            except httpx.HTTPError as exc:
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS upload failed: " + "; ".join(errors))

    async def put_bytes(
        self,
        object_key: str,
        data: bytes,
        *,
        content_type: str,
        metadata: Mapping[str, str] | None = None,
    ) -> StoredAudioObject:
        if len(data) > self.settings.audio_max_upload_bytes:
            raise AudioTooLargeError(
                "Generated audio exceeds the configured upload size limit"
            )
        checksum = hashlib.sha256(data).hexdigest()
        headers = _upload_headers(content_type, metadata, checksum)
        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            try:
                response = await self._client.put(
                    self._url(filer_url, object_key),
                    content=data,
                    headers=headers,
                )
                response.raise_for_status()
                return StoredAudioObject(
                    object_key=object_key,
                    etag=self._etag(response),
                    sha256=checksum,
                    size_bytes=len(data),
                    content_type=content_type,
                )
            except httpx.HTTPError as exc:
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS upload failed: " + "; ".join(errors))

    async def download_to_path(self, object_key: str, destination: Path) -> None:
        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            try:
                async with self._client.stream(
                    "GET", self._url(filer_url, object_key)
                ) as response:
                    response.raise_for_status()
                    with destination.open("wb") as output:
                        async for chunk in response.aiter_bytes(1024 * 1024):
                            output.write(chunk)
                return
            except (httpx.HTTPError, OSError) as exc:
                destination.unlink(missing_ok=True)
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS download failed: " + "; ".join(errors))

    async def get_bytes(self, object_key: str) -> tuple[bytes, str]:
        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            try:
                response = await self._client.get(self._url(filer_url, object_key))
                response.raise_for_status()
                return response.content, response.headers.get(
                    "Content-Type", "application/octet-stream"
                )
            except httpx.HTTPError as exc:
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS download failed: " + "; ".join(errors))

    async def get_prefix(self, object_key: str, limit: int = 4096) -> bytes:
        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            try:
                async with self._client.stream(
                    "GET",
                    self._url(filer_url, object_key),
                    headers={"Range": f"bytes=0-{limit - 1}"},
                ) as response:
                    response.raise_for_status()
                    prefix = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=limit):
                        prefix.extend(chunk[: limit - len(prefix)])
                        if len(prefix) >= limit:
                            break
                    return bytes(prefix)
            except httpx.HTTPError as exc:
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS download failed: " + "; ".join(errors))

    async def delete(self, object_key: str) -> bool:
        for filer_url in self.settings.seaweed_filers:
            try:
                response = await self._client.delete(
                    self._url(filer_url, object_key)
                )
                if response.status_code == 404:
                    return True
                response.raise_for_status()
                return True
            except httpx.HTTPError:
                continue
        return False

    async def list_objects(self, prefix: str) -> list[StoredObjectEntry]:
        errors: list[str] = []
        for filer_url in self.settings.seaweed_filers:
            try:
                return await self._list_tree(filer_url, prefix)
            except (httpx.HTTPError, ValueError) as exc:
                errors.append(f"{filer_url}: {exc}")
        raise AudioStorageError("SeaweedFS listing failed: " + "; ".join(errors))

    async def _list_tree(
        self, filer_url: str, prefix: str
    ) -> list[StoredObjectEntry]:
        pending = ["/" + prefix.strip("/")]
        files: list[StoredObjectEntry] = []
        while pending:
            directory = pending.pop()
            last_file_name: str | None = None
            while True:
                params: dict[str, str | int] = {"limit": 1000}
                if last_file_name:
                    params["lastFileName"] = last_file_name
                response = await self._client.get(
                    self._url(filer_url, directory.rstrip("/") + "/"),
                    params=params,
                    headers={"Accept": "application/json"},
                )
                if response.status_code == 404:
                    break
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("SeaweedFS directory response is not an object")
                entries = payload.get("Entries") or []
                if not isinstance(entries, list):
                    raise ValueError("SeaweedFS Entries is not a list")
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    full_path = str(entry.get("FullPath") or "")
                    if not full_path:
                        continue
                    mode = int(entry.get("Mode") or 0)
                    if mode & (1 << 31):
                        pending.append(full_path)
                        continue
                    modified = entry.get("Mtime") or entry.get("Crtime")
                    if not isinstance(modified, str):
                        continue
                    files.append(
                        StoredObjectEntry(
                            object_key=full_path,
                            modified_at=datetime.fromisoformat(
                                modified.replace("Z", "+00:00")
                            ),
                        )
                    )
                if not payload.get("ShouldDisplayLoadMore"):
                    break
                next_name = payload.get("LastFileName")
                if not isinstance(next_name, str) or not next_name:
                    break
                last_file_name = next_name
        return files

    @staticmethod
    def _url(filer_url: str, object_key: str) -> str:
        normalized = "/" + object_key.lstrip("/")
        return f"{filer_url}{quote(normalized, safe='/')}"

    @staticmethod
    def _etag(response: httpx.Response) -> str | None:
        header = response.headers.get("ETag")
        if header:
            return header.strip('"')
        try:
            payload = response.json()
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        value = payload.get("eTag") or payload.get("etag")
        return str(value).strip('"') if value else None


def _matches_audio_type(header: bytes, content_type: str) -> bool:
    if content_type in {"audio/wav", "audio/x-wav"}:
        return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE"
    if content_type == "audio/ogg":
        return header.startswith(b"OggS")
    if content_type == "audio/webm":
        return header.startswith(b"\x1aE\xdf\xa3")
    if content_type == "audio/mpeg":
        return header.startswith(b"ID3") or (
            len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0
        )
    if content_type in {"audio/mp4", "audio/x-m4a"}:
        return len(header) >= 12 and header[4:8] == b"ftyp"
    return False


def _upload_headers(
    content_type: str,
    metadata: Mapping[str, str] | None,
    checksum: str,
) -> dict[str, str]:
    headers = {
        "Content-Type": content_type,
        "Seaweed-Sha256": checksum,
    }
    for key, value in (metadata or {}).items():
        if not key or any(
            not (character.isalnum() or character == "-")
            for character in key
        ):
            raise ValueError(f"Invalid SeaweedFS metadata key: {key!r}")
        if "\r" in value or "\n" in value:
            raise ValueError(f"Invalid SeaweedFS metadata value for {key!r}")
        headers[f"Seaweed-{key}"] = value
    return headers
