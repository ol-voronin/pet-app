import { buildApp } from './build-app.js';
import { MemoryAuthRepo } from './modules/auth/memory-repo.js';
import { LogOtpSender } from './modules/auth/otp-sender.js';
import { AuthService } from './modules/auth/service.js';
import { MemoryDocumentsRepo } from './modules/documents/memory-repo.js';
import { DocumentsService } from './modules/documents/service.js';
import { MemoryFamilyRepo } from './modules/family/memory-repo.js';
import { FamilyService } from './modules/family/service.js';
import { MemoryPetsRepo } from './modules/pets/memory-repo.js';
import { PetsService } from './modules/pets/service.js';

/** Builds the OpenAPI document. Version is fixed so the committed spec is stable. */
import { MemoryPlacesRepo } from './modules/places/memory-repo.js';
import { PlacesService } from './modules/places/service.js';

export async function generateOpenApi(): Promise<string> {
  const authRepo = new MemoryAuthRepo();
  const petsRepo = new MemoryPetsRepo();
  const secret = 'openapi-export-only-secret-0000000000';
  const auth = new AuthService({ repo: authRepo, sender: new LogOtpSender(), secret });
  const pets = new PetsService({ repo: petsRepo, storage: null });
  const documents = new DocumentsService({
    repo: new MemoryDocumentsRepo(petsRepo),
    storage: null,
  });
  const family = new FamilyService({ repo: new MemoryFamilyRepo(petsRepo, authRepo), secret });
  const places = new PlacesService({
    repo: new MemoryPlacesRepo(),
    geocoder: { search: () => Promise.resolve([]) },
  });
  const app = await buildApp({ version: '0.0.0', auth, pets, documents, family, places });
  await app.ready();
  const spec = app.swagger();
  await app.close();
  return `${JSON.stringify(spec, null, 2)}\n`;
}
