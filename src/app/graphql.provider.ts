import { ApplicationConfig, inject } from '@angular/core';
import { ApolloClientOptions, InMemoryCache } from '@apollo/client/core';
import { Apollo, APOLLO_OPTIONS } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { setContext } from '@apollo/client/link/context';

const uri = 'http://localhost:8080/graphql';

export function apolloOptionsFactory(httpLink: HttpLink) {
    const auth = setContext((operation, context) => {
        const token = localStorage.getItem('social_auth_token');
        if (token === null) {
            return {};
        }

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = typeof payload?.exp === 'number' ? payload.exp : null;
            
            if (exp !== null && exp * 1000 <= Date.now()) {
                localStorage.removeItem('social_auth_token');
                return {};
            }
        } catch {
            localStorage.removeItem('social_auth_token');
            return {};
        }

        return {
            headers: {
                Authorization: `Bearer ${token}`
            }
        } as any;
    });

    const link = auth.concat(httpLink.create({ uri }) as any);

    return {
        link: link,
        cache: new InMemoryCache(),
    };
}

export const graphqlProvider: ApplicationConfig['providers'] = [
    Apollo,
    {
        provide: APOLLO_OPTIONS,
        useFactory: apolloOptionsFactory,
        deps: [HttpLink],
    },
];
